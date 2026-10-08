using Architecture.Fitness;
using NUnit.Framework;

namespace FitnessAnalyzer.Tests
{
    public sealed class BaselineTests
    {
        static readonly Violation ClientCallsEngine =
            new Violation("Design Don't #2: Client calls Engine", "Shop.CheckoutView", "Shop.PricingEngine", new[] { "CheckoutView.Quote" });

        [TestCase("Design Don't #2: Client calls Engine|Shop.CheckoutView|Shop.PricingEngine", true)]
        [TestCase("Design Don't #2*|Shop.CheckoutView|*", true)]
        [TestCase("*|Shop.*|Shop.PricingEngine", true)]
        [TestCase("Design Don't #2: Client calls Engine|Shop.CheckoutView", false)]
        [TestCase("Design Don't #2: Client calls Engine|Shop.Checkout|Shop.PricingEngine", false)]
        [TestCase("Design Don't #11*|*|*", false)]
        public void PatternsMatchSegmentBySegment(string pattern, bool matches)
        {
            Assert.That(new BaselineEntry(pattern, "test").Matches(ClientCallsEngine), Is.EqualTo(matches));
        }

        [Test]
        public void ApprovedAndDebtEntriesExplainViolations()
        {
            var approved = new[] { new BaselineEntry("Design Don't #2*|Shop.CheckoutView|*", "Approved deviations: hot path") };
            var debt = new[] { new BaselineEntry("Design Don't #11*|*|*", "Known debt: pricing") };

            Assert.That(Baseline.Unexplained(new[] { ClientCallsEngine }, approved, debt), Is.Empty);
            Assert.That(Baseline.Unexplained(new[] { ClientCallsEngine }, new BaselineEntry[0], debt), Is.EqualTo(new[] { ClientCallsEngine }));
        }

        [Test]
        public void UnusedEntriesAreTheFixedOnes()
        {
            var stillThere = new BaselineEntry("Design Don't #2*|*|*", "Known debt: views");
            var fixedOne = new BaselineEntry("Design Don't #11*|*|*", "Known debt: pricing");

            Assert.That(Baseline.Unused(new[] { stillThere, fixedOne }, new[] { ClientCallsEngine }), Is.EqualTo(new[] { fixedOne }));
        }
    }
}
