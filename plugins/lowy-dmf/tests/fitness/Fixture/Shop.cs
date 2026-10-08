// A small system that breaks every rule the analyzer checks exactly once, next to code that must pass.
// AnalyzerTests lists the expected violations; change both together.
using System.Collections;

namespace UnityEngine
{
    public class MonoBehaviour { }
}

namespace Shop.Messaging
{
    public static class Bus
    {
        public static void Publish<T>(T message) { }
        public static void Post(object message) { }
        public static void Subscribe<T>(System.Action<T> handler) { }
    }
}

namespace Shop.Contracts
{
    public interface IMessage { }
    public sealed class OrderPlaced : IMessage { }
    public sealed class PlaceOrderRequest : IMessage { }
}

namespace Shop.Common
{
    public static class Log
    {
        public static void Info(string message) { }
    }
}

namespace Shop.Platform
{
    public sealed class Database
    {
        public void Save() { }
    }
}

namespace Shop
{
    using Shop.Common;
    using Shop.Contracts;
    using Shop.Messaging;
    using Shop.Platform;

    public abstract class BaseManager
    {
        protected void Init() { }
    }

    public interface IOrderManager
    {
        void Place();
    }

    // Allowed: base call, own interface, Utility, Engine, ResourceAccess, publishing from a Manager.
    public class OrderManager : BaseManager, IOrderManager
    {
        readonly PricingEngine _pricing = new PricingEngine();
        readonly OrderAccess _orders = new OrderAccess();

        public IOrderManager Self => this;

        public void Place()
        {
            Init();
            Log.Info("placing");
            _pricing.Price();
            _orders.Save();
            Bus.Publish(new OrderPlaced());
        }
    }

    // Closed architecture: Manager calls Manager synchronously.
    public class DeliveryManager
    {
        readonly OrderManager _orders = new OrderManager();

        public void Deliver() => _orders.Place();
    }

    // Naming: gerund prefix on a Manager.
    public class BillingManager { }

    // "Setting" is in NotGerunds; this is also the fourth Manager of the subsystem.
    public class SettingManager { }

    // Design Don't #11; Engine to ResourceAccess is allowed.
    public class PricingEngine
    {
        readonly TaxEngine _tax = new TaxEngine();
        readonly OrderAccess _orders = new OrderAccess();

        public void Price()
        {
            _tax.Tax();
            _orders.Load();
        }
    }

    // Design Don't #7.
    public class TaxEngine
    {
        public void Tax() => Bus.Publish(new OrderPlaced());
    }

    // Design Don't #12, and #10 inside a lambda; ResourceAccess to Resource is allowed.
    public class OrderAccess
    {
        readonly StockAccess _stock = new StockAccess();
        readonly Database _database = new Database();

        public void Save() => _database.Save();

        public void Load()
        {
            _stock.Read();
            System.Action subscribe = () => Bus.Subscribe<OrderPlaced>(_ => { });
            subscribe();
        }
    }

    // Closed architecture: ResourceAccess calls up a layer.
    public class StockAccess
    {
        public void Read() { }

        public OrderManager Owner() => null;
    }

    public class CheckoutView : UnityEngine.MonoBehaviour
    {
        // Allowed: a Client calls one Manager, and a third-party type named like a Manager is not one.
        public void Buy() => new OrderManager().Place();

        public void Localize() => new System.Resources.ResourceManager(typeof(CheckoutView)).GetString("buy");

        // Design Don't #2, directly and inside an iterator.
        public void Quote() => new PricingEngine().Price();

        public IEnumerator Poll()
        {
            yield return new PricingEngine();
        }

        // Design Don't #6; posting a command to a Manager is allowed.
        public void Notify() => Bus.Publish(new OrderPlaced());

        public void Request() => Bus.Publish(new PlaceOrderRequest());

        // Closed architecture: a Client skips to a Resource.
        public void Direct() => new Database().Save();

        // Not checkable: the message type is only known at run time.
        public void Forward(object message) => Bus.Post(message);

        public void Relay(IMessage message) => Bus.Publish(message);

        // The static type is IMessage, but the call site shows the run-time type: still Design Don't #6.
        public void Announce() => Bus.Publish<IMessage>(new OrderPlaced());
    }

    // A Client through its base class.
    public class ExpressCheckoutView : CheckoutView { }

    // The composition root wires every layer; with CompositionRoots unset it would be a Client calling an Engine.
    public class ShopBootstrap : UnityEngine.MonoBehaviour
    {
        public OrderManager Orders;

        public void Awake()
        {
            var pricing = new PricingEngine();
            pricing.Price();
            Orders = new OrderManager();
        }
    }
}
