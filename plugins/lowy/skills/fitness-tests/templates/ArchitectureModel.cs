// Architecture fitness model, from the lowy Claude Code plugin (fitness-tests skill).
// Copy this file as is; configure the rules in ArchitectureProfile.cs instead of editing it.
using System;
using System.Collections.Generic;
using System.Linq;
using Mono.Cecil;

namespace Architecture.Fitness
{
    public enum Layer { Unclassified, Client, Manager, Engine, ResourceAccess, Resource, Utility }

    /// <summary>A messaging entry point: a call to one of <see cref="Methods"/> on <see cref="Type"/> publishes or subscribes.</summary>
    public sealed class MessagingApi
    {
        public readonly string Type;
        public readonly string[] Methods;

        public MessagingApi(string type, params string[] methods)
        {
            Type = type;
            Methods = methods;
        }

        internal bool Matches(MethodReference method) =>
            Methods.Contains(method.Name) && Analyzer.Normalize(method.DeclaringType).FullName == Type;
    }

    /// <summary>How the methodology maps onto one codebase. Built by ArchitectureProfile.Map() from the project profile.</summary>
    public sealed class ArchitectureMap
    {
        /// <summary>Assemblies to analyze, by name prefix.</summary>
        public string[] AssemblyPrefixes = Array.Empty<string>();
        /// <summary>Assemblies to skip even when a prefix matches, by name fragment.</summary>
        public string[] ExcludedAssemblyFragments = { "Tests", "Editor" };
        /// <summary>Explicit layer per type full name; highest precedence.</summary>
        public (string Type, Layer Layer)[] Types = Array.Empty<(string, Layer)>();
        /// <summary>Layer per namespace prefix; applied before suffixes.</summary>
        public (string Namespace, Layer Layer)[] Namespaces = Array.Empty<(string, Layer)>();
        /// <summary>Layer per type-name suffix; a leading interface "I" is ignored.</summary>
        public (string Suffix, Layer Layer)[] Suffixes =
        {
            ("Manager", Layer.Manager), ("Engine", Layer.Engine), ("Access", Layer.ResourceAccess),
        };
        /// <summary>Types deriving from these (full names) are Clients when no other rule classifies them.</summary>
        public string[] ClientBaseTypes = { "UnityEngine.MonoBehaviour" };
        /// <summary>Types that wire the services together (full names); what they reference is not checked, what references them is.</summary>
        public string[] CompositionRoots = Array.Empty<string>();
        /// <summary>Namespaces of Resources (platform, I/O, network) that only ResourceAccess may touch.</summary>
        public string[] ResourceNamespaces = Array.Empty<string>();
        public MessagingApi[] Publish = Array.Empty<MessagingApi>();
        public MessagingApi[] Subscribe = Array.Empty<MessagingApi>();
        /// <summary>Tells an event from a command posted to a Manager; Clients may post commands but not publish events.</summary>
        public Func<TypeReference, bool> IsEvent = _ => true;
        /// <summary>Subsystems by assembly name prefix, for the Managers-per-subsystem limit.</summary>
        public (string Name, string[] AssemblyPrefixes)[] Subsystems = Array.Empty<(string, string[])>();
        public int MaxManagersPerSubsystem = 3;
        /// <summary>Words ending in "ing" that are nouns, not gerunds, in this domain.</summary>
        public string[] NotGerunds = { "Thing", "String", "Ring", "Wing", "King", "Spring", "Ceiling", "Setting" };

        public bool Includes(string assemblyName) =>
            AssemblyPrefixes.Any(assemblyName.StartsWith) && !ExcludedAssemblyFragments.Any(assemblyName.Contains);
    }

    /// <summary>One rule broken between two types. <see cref="Key"/> ignores locations, so baselines survive edits.</summary>
    public sealed class Violation
    {
        public readonly string Rule;
        public readonly string From;
        public readonly string To;
        public readonly IReadOnlyList<string> Locations;

        public Violation(string rule, string from, string to, IReadOnlyList<string> locations)
        {
            Rule = rule;
            From = from;
            To = to;
            Locations = locations;
        }

        public string Key => $"{Rule}|{From}|{To}";

        public override string ToString() =>
            $"{Key}  (at {string.Join(", ", Locations.Take(3))}{(Locations.Count > 3 ? $" and {Locations.Count - 3} more" : "")})";
    }

    public sealed class FitnessReport
    {
        public readonly IReadOnlyList<Violation> Violations;
        /// <summary>What could not be checked, such as a message published through a variable of unknown type.</summary>
        public readonly IReadOnlyList<string> Unchecked;
        /// <summary>Layer of every analyzed top-level type, so the Mapping can be checked against intent.</summary>
        public readonly IReadOnlyList<(string Type, string Assembly, Layer Layer)> Layers;

        public FitnessReport(IReadOnlyList<Violation> violations, IReadOnlyList<string> @unchecked, IReadOnlyList<(string, string, Layer)> layers)
        {
            Violations = violations;
            Unchecked = @unchecked;
            Layers = layers;
        }
    }

    /// <summary>An Approved deviation or a Known debt item. Pattern is "Rule|From|To"; a segment may be "*" or end with "*".</summary>
    public sealed class BaselineEntry
    {
        public readonly string Pattern;
        public readonly string ProfileRef;

        public BaselineEntry(string pattern, string profileRef)
        {
            Pattern = pattern;
            ProfileRef = profileRef;
        }

        public bool Matches(Violation v)
        {
            var p = Pattern.Split('|');
            var k = v.Key.Split('|');
            if (p.Length != k.Length) return false;
            for (var i = 0; i < p.Length; i++)
            {
                var ok = p[i] == "*"
                    || (p[i].EndsWith("*") && k[i].StartsWith(p[i].Substring(0, p[i].Length - 1), StringComparison.Ordinal))
                    || p[i] == k[i];
                if (!ok) return false;
            }
            return true;
        }

        public override string ToString() => $"{Pattern}  [{ProfileRef}]";
    }

    public static class Baseline
    {
        /// <summary>Violations that match neither an approved deviation nor known debt.</summary>
        public static IReadOnlyList<Violation> Unexplained(IEnumerable<Violation> found, IEnumerable<BaselineEntry> approved, IEnumerable<BaselineEntry> debt)
        {
            var entries = approved.Concat(debt).ToArray();
            return found.Where(v => !entries.Any(e => e.Matches(v))).ToArray();
        }

        /// <summary>Entries that no violation matches any more: fixed debt, or a retired deviation.</summary>
        public static IReadOnlyList<BaselineEntry> Unused(IEnumerable<BaselineEntry> entries, IReadOnlyList<Violation> found) =>
            entries.Where(e => !found.Any(e.Matches)).ToArray();
    }
}
