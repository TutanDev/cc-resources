// Architecture fitness tests, from the lowy-dmf Claude Code plugin (fitness-tests skill).
// Copy this file as is; the rules and the baseline live in ArchitectureProfile.cs.
using System.Collections.Generic;
using System.IO;
using System.Linq;
using NUnit.Framework;
using UnityEditor;
using UnityEditor.Compilation;

namespace Architecture.Fitness
{
    public sealed class ArchitectureFitnessTests
    {
        FitnessReport _report;

        [OneTimeSetUp]
        public void AnalyzeCompiledAssemblies()
        {
            var map = ArchitectureProfile.Map();
            var assemblies = CompilationPipeline.GetAssemblies(AssembliesType.PlayerWithoutTestAssemblies)
                .Where(a => map.Includes(a.name))
                .Select(a => Path.GetFullPath(a.outputPath))
                .Where(File.Exists)
                .ToArray();
            Assert.That(assemblies, Is.Not.Empty, "No compiled assembly matches ArchitectureProfile.Map().AssemblyPrefixes.");

            // Base types resolve through the engine, packages and plugins, so a MonoBehaviour three levels deep is still a Client.
            var managed = Path.Combine(EditorApplication.applicationContentsPath, "Managed");
            var searchDirectories = assemblies
                .Concat(CompilationPipeline.GetPrecompiledAssemblyPaths(CompilationPipeline.PrecompiledAssemblySources.All))
                .Select(p => Path.GetDirectoryName(Path.GetFullPath(p)))
                .Concat(new[] { managed, Path.Combine(managed, "UnityEngine") })
                .Distinct();
            _report = Analyzer.Analyze(assemblies, map, searchDirectories);
        }

        [Test]
        public void TheMappingFindsTheServices()
        {
            var services = _report.Layers
                .Where(l => l.Layer == Layer.Manager || l.Layer == Layer.Engine || l.Layer == Layer.ResourceAccess || l.Layer == Layer.Utility)
                .OrderBy(l => l.Layer).ThenBy(l => l.Type)
                .Select(l => $"{l.Layer,-14} {l.Type}  [{l.Assembly}]");
            var counts = _report.Layers.GroupBy(l => l.Layer).OrderBy(g => g.Key).Select(g => $"{g.Key}: {g.Count()}");
            TestContext.WriteLine(Describe("Types per layer:", counts));
            TestContext.WriteLine(Describe("Services, to check against the profile's Mapping:", services));
            Assert.That(_report.Layers.Any(l => l.Layer == Layer.Manager), Is.True,
                "No Manager found: ArchitectureProfile.Map() does not match the code.");
        }

        [Test]
        public void NoViolationOutsideTheProfile()
        {
            var unexplained = Baseline.Unexplained(_report.Violations, ArchitectureProfile.ApprovedDeviations, ArchitectureProfile.KnownDebt);
            Assert.That(unexplained, Is.Empty, Describe(
                "Architecture violations that the project profile does not list.\n" +
                "Fix them, or propose an Approved deviations entry in .claude/docs/architecture.md and mirror it in ArchitectureProfile.cs:",
                unexplained.Select(v => v.ToString())));
        }

        [Test]
        public void FixedDebtLeavesTheBaseline()
        {
            var fixedDebt = Baseline.Unused(ArchitectureProfile.KnownDebt, _report.Violations);
            Assert.That(fixedDebt, Is.Empty, Describe(
                "Known debt that no longer occurs. Remove it from ArchitectureProfile.KnownDebt and from the profile's Known debt section:",
                fixedDebt.Select(e => e.ToString())));
        }

        // Advisory checks end Inconclusive, not failed: Unity's NUnit 3.5 has no Assert.Warn.
        [Test]
        public void ApprovedDeviationsStillApply()
        {
            var unused = Baseline.Unused(ArchitectureProfile.ApprovedDeviations, _report.Violations);
            if (unused.Count > 0)
                Assert.Inconclusive(Describe("Approved deviations that match no code any more; consider retiring them:", unused.Select(e => e.ToString())));
        }

        [Test]
        public void ReportWhatCouldNotBeChecked()
        {
            if (_report.Unchecked.Count > 0)
                Assert.Inconclusive(Describe($"Analyzed {_report.Layers.Count} types; not checked:", _report.Unchecked));
        }

        static string Describe(string header, IEnumerable<string> lines) => header + "\n  " + string.Join("\n  ", lines);
    }
}
