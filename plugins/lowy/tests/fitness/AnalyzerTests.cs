using System.IO;
using System.Linq;
using Architecture.Fitness;
using Mono.Cecil;
using NUnit.Framework;

namespace FitnessAnalyzer.Tests
{
    public sealed class AnalyzerTests
    {
        static readonly string FixtureDirectory = Path.Combine(TestContext.CurrentContext.TestDirectory, "fixture");

        static ArchitectureMap ShopMap() => new ArchitectureMap
        {
            AssemblyPrefixes = new[] { "Shop." },
            Namespaces = new[] { ("Shop.Common", Layer.Utility) },
            ResourceNamespaces = new[] { "Shop.Platform" },
            Publish = new[] { new MessagingApi("Shop.Messaging.Bus", "Publish", "Post") },
            Subscribe = new[] { new MessagingApi("Shop.Messaging.Bus", "Subscribe") },
            IsEvent = (TypeReference message) => !message.Name.EndsWith("Request"),
            Subsystems = new[] { ("Shop", new[] { "Shop.Fixture" }) },
            CompositionRoots = new[] { "Shop.ShopBootstrap" },
        };

        static FitnessReport Analyze(ArchitectureMap map) =>
            Analyzer.Analyze(new[] { Path.Combine(FixtureDirectory, "Shop.Fixture.dll") }, map, new[] { FixtureDirectory });

        [Test]
        public void FindsEachViolationOfTheFixtureOnce()
        {
            var keys = Analyze(ShopMap()).Violations.Select(v => v.Key);

            Assert.That(keys, Is.EquivalentTo(new[]
            {
                "Closed architecture: Manager calls Manager synchronously (queue it)|Shop.DeliveryManager|Shop.OrderManager",
                "Naming: gerund prefix on a Manager (functional decomposition)|Shop.BillingManager|Billing",
                "Structure: more than 3 Managers in a subsystem|Shop|",
                "Design Don't #11: Engine calls Engine|Shop.PricingEngine|Shop.TaxEngine",
                "Design Don't #7: Engine publishes|Shop.TaxEngine|Shop.Messaging.Bus",
                "Design Don't #12: ResourceAccess calls ResourceAccess|Shop.OrderAccess|Shop.StockAccess",
                "Design Don't #10: subscribes below the Managers|Shop.OrderAccess|Shop.Messaging.Bus",
                "Closed architecture: calls up a layer|Shop.StockAccess|Shop.OrderManager",
                "Design Don't #2: Client calls Engine|Shop.CheckoutView|Shop.PricingEngine",
                "Design Don't #6: Client publishes an event|Shop.CheckoutView|Shop.Contracts.OrderPlaced",
                "Closed architecture: skips a layer|Shop.CheckoutView|Shop.Platform.Database",
            }));
        }

        [Test]
        public void ReportsTheSourceMemberOfLambdasAndIterators()
        {
            var violations = Analyze(ShopMap()).Violations;

            Assert.That(violations.Single(v => v.Rule.StartsWith("Design Don't #10")).Locations, Is.EqualTo(new[] { "OrderAccess.Load" }));
            Assert.That(violations.Single(v => v.Rule.StartsWith("Design Don't #2")).Locations, Is.EquivalentTo(new[] { "CheckoutView.Quote", "CheckoutView.Poll" }));
        }

        [Test]
        public void PrefersTheRunTimeMessageTypeOverTheTypeArgument()
        {
            var publishes = Analyze(ShopMap()).Violations.Single(v => v.Rule.StartsWith("Design Don't #6"));

            Assert.That(publishes.Locations, Is.EquivalentTo(new[] { "CheckoutView.Notify", "CheckoutView.Announce" }));
        }

        [Test]
        public void ListsMessagesItCannotClassify()
        {
            Assert.That(Analyze(ShopMap()).Unchecked, Is.EquivalentTo(new[]
            {
                "CheckoutView.Forward: message kind unknown (published through a variable)",
                "CheckoutView.Relay: message kind unknown (published through a variable)",
            }));
        }

        [Test]
        public void ClassifiesBySuffixNamespaceAndBaseType()
        {
            var layers = Analyze(ShopMap()).Layers.ToDictionary(l => l.Type, l => l.Layer);

            using (Assert.EnterMultipleScope())
            {
                Assert.That(layers["Shop.IOrderManager"], Is.EqualTo(Layer.Manager));
                Assert.That(layers["Shop.PricingEngine"], Is.EqualTo(Layer.Engine));
                Assert.That(layers["Shop.StockAccess"], Is.EqualTo(Layer.ResourceAccess));
                Assert.That(layers["Shop.Common.Log"], Is.EqualTo(Layer.Utility));
                Assert.That(layers["Shop.ExpressCheckoutView"], Is.EqualTo(Layer.Client));
                Assert.That(layers["Shop.BaseManager"], Is.EqualTo(Layer.Manager));
                Assert.That(layers["Shop.Contracts.OrderPlaced"], Is.EqualTo(Layer.Unclassified));
            }
        }

        [Test]
        public void ExplicitTypesOverrideSuffixes()
        {
            var map = ShopMap();
            map.Types = new[] { ("Shop.TaxEngine", Layer.Utility) };

            var keys = Analyze(map).Violations.Select(v => v.Key).ToArray();

            Assert.That(keys, Has.None.StartsWith("Design Don't #11"));
            Assert.That(keys, Has.None.StartsWith("Design Don't #7"), "Utilities are not checked.");
        }

        [Test]
        public void CompositionRootsAreTheOnlyClientsAllowedToWireEngines()
        {
            var map = ShopMap();
            map.CompositionRoots = new string[0];

            Assert.That(Analyze(map).Violations.Select(v => v.Key), Has.Member("Design Don't #2: Client calls Engine|Shop.ShopBootstrap|Shop.PricingEngine"));
        }

        [Test]
        public void NotGerundsSilenceTheNamingRule()
        {
            var map = ShopMap();
            map.NotGerunds = map.NotGerunds.Concat(new[] { "Billing" }).ToArray();

            Assert.That(Analyze(map).Violations.Select(v => v.Rule), Has.None.StartsWith("Naming"));
        }

        [Test]
        public void TheManagerLimitComesFromTheMap()
        {
            var map = ShopMap();
            map.MaxManagersPerSubsystem = 4;

            Assert.That(Analyze(map).Violations.Select(v => v.Rule), Has.None.StartsWith("Structure"));
        }

        [Test]
        public void IncludesMatchesPrefixesAndSkipsTestAndEditorAssemblies()
        {
            var map = ShopMap();

            using (Assert.EnterMultipleScope())
            {
                Assert.That(map.Includes("Shop.Fixture"), Is.True);
                Assert.That(map.Includes("Shop.Fixture.Tests"), Is.False);
                Assert.That(map.Includes("Shop.Editor"), Is.False);
                Assert.That(map.Includes("Vendor.Shop"), Is.False);
            }
        }

        [Test]
        public void TheProfileTemplateBuildsAMap()
        {
            var map = ArchitectureProfile.Map();

            Assert.That(map.Includes("Acme.Ordering"), Is.True);
        }
    }
}
