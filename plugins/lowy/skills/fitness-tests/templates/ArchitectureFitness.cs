// Architecture fitness analyzer, from the lowy-dmf Claude Code plugin (fitness-tests skill).
// Copy this file as is; configure the rules in ArchitectureProfile.cs instead of editing it.
// It reads compiled assemblies with Mono.Cecil, so it sees every reference, call and allocation,
// including static calls and calls inside lambdas, without loading the assemblies.
using System;
using System.Collections.Generic;
using System.Linq;
using Mono.Cecil;
using Mono.Cecil.Cil;

namespace Architecture.Fitness
{
    public static class Analyzer
    {
        public static FitnessReport Analyze(IEnumerable<string> assemblyPaths, ArchitectureMap map, IEnumerable<string> searchDirectories)
        {
            using (var resolver = new DefaultAssemblyResolver())
            {
                foreach (var dir in searchDirectories) resolver.AddSearchDirectory(dir);
                var parameters = new ReaderParameters { AssemblyResolver = resolver, ReadSymbols = false };
                var assemblies = assemblyPaths.Select(p => AssemblyDefinition.ReadAssembly(p, parameters)).ToList();
                try
                {
                    return new Run(map, assemblies).Execute();
                }
                finally
                {
                    foreach (var a in assemblies) a.Dispose();
                }
            }
        }

        /// <summary>The type a reference is about: element of arrays and by-refs, open generic, outermost declaring type.</summary>
        internal static TypeReference Normalize(TypeReference t)
        {
            while (true)
            {
                if (t is TypeSpecification spec) t = spec.ElementType;
                else if (t.DeclaringType != null) t = t.DeclaringType;
                else return t;
            }
        }

        static string ServiceName(TypeReference t)
        {
            var name = t.Name;
            var tick = name.IndexOf('`');
            if (tick >= 0) name = name.Substring(0, tick);
            if (name.Length > 2 && name[0] == 'I' && char.IsUpper(name[1])) name = name.Substring(1);
            return name;
        }

        sealed class Run
        {
            readonly ArchitectureMap _map;
            readonly List<AssemblyDefinition> _assemblies;
            readonly Dictionary<string, Layer> _layers = new Dictionary<string, Layer>();
            readonly Dictionary<string, (string Rule, string From, string To, List<string> Locations)> _found =
                new Dictionary<string, (string, string, string, List<string>)>();
            readonly List<string> _unchecked = new List<string>();

            internal Run(ArchitectureMap map, List<AssemblyDefinition> assemblies)
            {
                _map = map;
                _assemblies = assemblies;
            }

            internal FitnessReport Execute()
            {
                var owners = _assemblies.SelectMany(a => a.MainModule.Types).Where(t => !IsCompilerGenerated(t)).ToList();
                foreach (var owner in owners)
                {
                    var from = LayerOf(owner);
                    if (from == Layer.Unclassified || from == Layer.Utility || _map.CompositionRoots.Contains(owner.FullName)) continue;
                    CheckNaming(owner, from);
                    var self = SelfOf(owner);
                    foreach (var type in SelfAndNested(owner)) CheckReferences(owner, from, type, self);
                }
                CheckManagersPerSubsystem(owners);
                var violations = _found.Values
                    .Select(f => new Violation(f.Rule, f.From, f.To, f.Locations.Distinct().ToArray()))
                    .OrderBy(v => v.Key, StringComparer.Ordinal)
                    .ToArray();
                var layers = owners.Select(o => (o.FullName, o.Module.Assembly.Name.Name, LayerOf(o))).ToArray();
                return new FitnessReport(violations, _unchecked.Distinct().ToArray(), layers);
            }

            static IEnumerable<TypeDefinition> SelfAndNested(TypeDefinition t) =>
                new[] { t }.Concat(t.NestedTypes.SelectMany(SelfAndNested));

            static bool IsCompilerGenerated(TypeDefinition t) => t.Name.StartsWith("<") || t.Name == "<Module>";

            Layer LayerOf(TypeReference reference)
            {
                var t = Normalize(reference);
                if (t is GenericParameter) return Layer.Unclassified;
                var key = $"{AssemblyOf(t)}|{t.FullName}";
                if (_layers.TryGetValue(key, out var cached)) return cached;
                var layer = Classify(t);
                _layers[key] = layer;
                return layer;
            }

            Layer Classify(TypeReference t)
            {
                foreach (var (type, layer) in _map.Types)
                    if (t.FullName == type) return layer;
                if (_map.ResourceNamespaces.Any(ns => t.Namespace == ns || t.Namespace.StartsWith(ns + ".", StringComparison.Ordinal)))
                    return Layer.Resource;
                foreach (var (ns, layer) in _map.Namespaces)
                    if (t.Namespace == ns || t.Namespace.StartsWith(ns + ".", StringComparison.Ordinal)) return layer;
                // Suffixes describe this codebase only: a third-party SceneManager is not a Löwy Manager.
                if (!IsAnalyzed(t)) return Layer.Unclassified;
                var name = ServiceName(t);
                foreach (var (suffix, layer) in _map.Suffixes)
                    if (name.Length > suffix.Length && name.EndsWith(suffix, StringComparison.Ordinal)) return layer;
                return DerivesFromClientBase(t) ? Layer.Client : Layer.Unclassified;
            }

            bool DerivesFromClientBase(TypeReference t)
            {
                try
                {
                    for (var def = t.Resolve(); def?.BaseType != null; def = def.BaseType.Resolve())
                        if (_map.ClientBaseTypes.Contains(def.BaseType.FullName)) return true;
                }
                catch (AssemblyResolutionException e)
                {
                    _unchecked.Add($"Base types of {t.FullName}: {e.AssemblyReference.Name} not found");
                }
                return false;
            }

            bool IsAnalyzed(TypeReference t)
            {
                var assembly = AssemblyOf(t);
                return _assemblies.Any(a => a.Name.Name == assembly);
            }

            static string AssemblyOf(TypeReference t)
            {
                switch (t.Scope)
                {
                    case ModuleDefinition module: return module.Assembly.Name.Name;
                    case AssemblyNameReference assembly: return assembly.Name;
                    default: return t.Scope?.Name ?? "";
                }
            }

            void CheckReferences(TypeDefinition owner, Layer from, TypeDefinition type, ISet<string> self)
            {
                // Lambdas, iterators and async methods compile to nested types; report the source member.
                var generatedFrom = IsCompilerGenerated(type) ? Decode(type.Name) : null;
                foreach (var f in type.Fields)
                    CheckEdge(owner, from, f.FieldType, $"{owner.Name}.{generatedFrom ?? Decode(f.Name) ?? f.Name}", self);
                foreach (var m in type.Methods)
                {
                    var where = $"{owner.Name}.{Decode(m.Name) ?? generatedFrom ?? m.Name}";
                    CheckEdge(owner, from, m.ReturnType, where, self);
                    foreach (var p in m.Parameters) CheckEdge(owner, from, p.ParameterType, where, self);
                    if (!m.HasBody) continue;
                    foreach (var v in m.Body.Variables) CheckEdge(owner, from, v.VariableType, where, self);
                    foreach (var ins in m.Body.Instructions)
                    {
                        switch (ins.Operand)
                        {
                            case MethodReference call:
                                CheckEdge(owner, from, call.DeclaringType, where, self);
                                if (call is GenericInstanceMethod gim)
                                    foreach (var arg in gim.GenericArguments) CheckEdge(owner, from, arg, where, self);
                                CheckMessaging(owner, from, call, ins, where);
                                break;
                            case FieldReference field:
                                CheckEdge(owner, from, field.DeclaringType, where, self);
                                break;
                            case TypeReference typeRef:
                                CheckEdge(owner, from, typeRef, where, self);
                                break;
                        }
                    }
                }
            }

            /// <summary>"&lt;Setup&gt;b__5_0" and "&lt;Load&gt;d__3" become "Setup" and "Load"; other names give null.</summary>
            static string Decode(string name)
            {
                if (name.Length < 3 || name[0] != '<') return null;
                var close = name.IndexOf('>');
                return close > 1 ? name.Substring(1, close - 1) : null;
            }

            /// <summary>The owner, its base types and its interfaces: base.Init() or a field typed IFooManager inside FooManager is not a dependency.</summary>
            ISet<string> SelfOf(TypeDefinition owner)
            {
                var self = new HashSet<string> { owner.FullName };
                try
                {
                    for (var def = owner; def != null; def = def.BaseType?.Resolve())
                    {
                        if (def.BaseType != null) self.Add(Normalize(def.BaseType).FullName);
                        foreach (var i in def.Interfaces) self.Add(Normalize(i.InterfaceType).FullName);
                    }
                }
                catch (AssemblyResolutionException)
                {
                    // DerivesFromClientBase reports the missing assembly; the types found so far still count.
                }
                return self;
            }

            void CheckEdge(TypeDefinition owner, Layer from, TypeReference target, string where, ISet<string> self)
            {
                foreach (var t in Expand(target))
                {
                    var normalized = Normalize(t);
                    if (self.Contains(normalized.FullName)) continue;
                    var to = LayerOf(normalized);
                    var rule = EdgeRule(from, to);
                    if (rule != null) Add(rule, owner.FullName, normalized.FullName, where);
                }
            }

            static IEnumerable<TypeReference> Expand(TypeReference t)
            {
                yield return t;
                if (t is GenericInstanceType git)
                    foreach (var arg in git.GenericArguments)
                    foreach (var inner in Expand(arg))
                        yield return inner;
                else if (t is TypeSpecification spec)
                    foreach (var inner in Expand(spec.ElementType))
                        yield return inner;
            }

            /// <summary>The closed architecture with the relaxed rules of Löwy's Method; null when the edge is allowed.</summary>
            static string EdgeRule(Layer from, Layer to)
            {
                if (to == Layer.Unclassified || to == Layer.Utility) return null;
                switch (from, to)
                {
                    case (Layer.Client, Layer.Client):
                    case (Layer.Client, Layer.Manager):
                    case (Layer.Manager, Layer.Engine):
                    case (Layer.Manager, Layer.ResourceAccess):
                    case (Layer.Engine, Layer.ResourceAccess):
                    case (Layer.ResourceAccess, Layer.Resource):
                    case (Layer.Resource, Layer.Resource):
                        return null;
                    case (Layer.Client, Layer.Engine):
                        return "Design Don't #2: Client calls Engine";
                    case (Layer.Engine, Layer.Engine):
                        return "Design Don't #11: Engine calls Engine";
                    case (Layer.ResourceAccess, Layer.ResourceAccess):
                        return "Design Don't #12: ResourceAccess calls ResourceAccess";
                    case (Layer.Manager, Layer.Manager):
                        return "Closed architecture: Manager calls Manager synchronously (queue it)";
                }
                return to < from ? "Closed architecture: calls up a layer" : "Closed architecture: skips a layer";
            }

            void CheckMessaging(TypeDefinition owner, Layer from, MethodReference call, Instruction ins, string where)
            {
                var api = Normalize(call.DeclaringType).FullName;
                if (_map.Publish.Any(p => p.Matches(call)))
                {
                    switch (from)
                    {
                        case Layer.Engine:
                            Add("Design Don't #7: Engine publishes", owner.FullName, api, where);
                            break;
                        case Layer.ResourceAccess:
                            Add("Design Don't #8: ResourceAccess publishes", owner.FullName, api, where);
                            break;
                        case Layer.Resource:
                            Add("Design Don't #9: Resource publishes", owner.FullName, api, where);
                            break;
                        case Layer.Client:
                            var message = MessageType(call, ins);
                            if (message == null)
                                _unchecked.Add($"{where}: message kind unknown (published through a variable)");
                            else if (_map.IsEvent(message))
                                Add("Design Don't #6: Client publishes an event", owner.FullName, message.FullName, where);
                            break;
                    }
                }
                if (_map.Subscribe.Any(s => s.Matches(call)) && (from == Layer.Engine || from == Layer.ResourceAccess || from == Layer.Resource))
                    Add("Design Don't #10: subscribes below the Managers", owner.FullName, api, where);
            }

            /// <summary>The run-time message type when the call site shows it: a "new" right before the call, or a concrete type argument.</summary>
            static TypeReference MessageType(MethodReference call, Instruction ins)
            {
                var previous = ins.Previous;
                if (previous?.OpCode == OpCodes.Newobj && previous.Operand is MethodReference ctor) return ctor.DeclaringType;
                if (previous?.OpCode == OpCodes.Box && previous.Operand is TypeReference boxed) return Concrete(boxed);
                return call is GenericInstanceMethod gim ? Concrete(gim.GenericArguments[0]) : null;
            }

            /// <summary>Null for object, interfaces, abstract classes and open generics: Publish&lt;IMessage&gt;(m) says nothing about m.</summary>
            static TypeReference Concrete(TypeReference t)
            {
                if (t is GenericParameter || t.FullName == "System.Object" || t.FullName == "System.ValueType") return null;
                try
                {
                    var definition = t.Resolve();
                    return definition != null && (definition.IsInterface || definition.IsAbstract) ? null : t;
                }
                catch (AssemblyResolutionException)
                {
                    return t;
                }
            }

            void CheckNaming(TypeDefinition owner, Layer layer)
            {
                if (owner.IsInterface || (layer != Layer.Manager && layer != Layer.ResourceAccess)) return;
                var suffix = layer == Layer.Manager ? "Manager" : "Access";
                var name = ServiceName(owner);
                if (!name.EndsWith(suffix, StringComparison.Ordinal)) return;
                var lastWord = LastWord(name.Substring(0, name.Length - suffix.Length));
                if (lastWord.Length > 4 && lastWord.EndsWith("ing", StringComparison.Ordinal) && !_map.NotGerunds.Contains(lastWord))
                    Add($"Naming: gerund prefix on a {layer} (functional decomposition)", owner.FullName, lastWord, owner.Name);
            }

            static string LastWord(string pascal)
            {
                for (var i = pascal.Length - 1; i > 0; i--)
                    if (char.IsUpper(pascal[i])) return pascal.Substring(i);
                return pascal;
            }

            void CheckManagersPerSubsystem(List<TypeDefinition> owners)
            {
                foreach (var (name, prefixes) in _map.Subsystems)
                {
                    var managers = owners
                        .Where(t => !t.IsInterface && !t.IsAbstract && prefixes.Any(p => t.Module.Assembly.Name.Name.StartsWith(p, StringComparison.Ordinal)))
                        .Where(t => LayerOf(t) == Layer.Manager)
                        .Select(t => t.Name)
                        .ToArray();
                    if (managers.Length > _map.MaxManagersPerSubsystem)
                        Add($"Structure: more than {_map.MaxManagersPerSubsystem} Managers in a subsystem", name, "", managers);
                }
            }

            void Add(string rule, string from, string to, params string[] locations)
            {
                var key = $"{rule}|{from}|{to}";
                if (!_found.TryGetValue(key, out var entry))
                {
                    entry = (rule, from, to, new List<string>());
                    _found[key] = entry;
                }
                entry.Locations.AddRange(locations);
            }
        }
    }
}
