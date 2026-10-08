# Message Bus & Wiring Patterns Reference

## Table of Contents
1. What Is a Message Bus
2. Architectural Constraints on the Bus
3. Operational Concepts
4. The "Message Is the Application" Pattern
5. Workflow Managers
6. When to Use a Message Bus vs. Simpler Alternatives
7. TradeMe Interaction Pattern (Worked Example)

---

## 1. What Is a Message Bus

A message bus is a **queued Pub/Sub** Utility. Any message posted to the bus is broadcast to subscribing parties. It provides general-purpose, queued, N:M communication (N publishers, M subscribers, where N and M can be any non-negative integers).

**Key properties:**
- If the bus or publisher goes offline, messages are queued until connectivity restores.
- If a subscriber goes offline (e.g., mobile device), messages accumulate in a per-subscriber queue.
- When all parties are connected, messages are asynchronous.
- The bus is a **Utility** - it sits in the vertical bar, accessible to all layers (subject to architectural constraints).

**Required capabilities (minimum):**
Queuing, multicast broadcasting, headers/context propagation, security on posting and retrieving, offline/disconnected work, delivery failure handling, processing failure handling, poison message handling, transactional processing, high throughput, service-layer API, multi-protocol support (not just HTTP).

**Optional capabilities:**
Message filtering, inspection, custom interception, instrumentation, diagnostics, automated deployment, credentials store integration, remote configuration.

---

## 2. Architectural Constraints on the Bus

Adding a message bus does NOT eliminate the need for closed-architecture rules. The bus is a transport mechanism, not a license for open architecture.

**Still prohibited over the bus:**
- Client-to-Client communication
- Engine-to-Engine communication
- ResourceAccess-to-ResourceAccess communication
- Clients publishing system state events (Design Don't #6)
- Engines publishing events (Design Don't #7)
- ResourceAccess publishing events (Design Don't #8)
- Engines or ResourceAccess subscribing to events (Design Don't #10)

**Permitted over the bus:**
- Client → Manager (use case initiation via message posting)
- Manager → Manager (queued, deferred use case triggering)
- Manager → Client (event notification via Pub/Sub)
- Manager publishing events (state change notifications)
- Clients and Managers subscribing to events

---

## 3. Operational Concepts

When ALL Client-to-Manager communication goes through a Message Bus, the following operational properties emerge:

**Common medium.** All communication uses the same bus, encapsulating message format, party locations, and communication protocol.

**No direct interaction.** Use case initiators (Clients) and executors (Managers) never interact directly. Neither knows about the other. They can evolve independently → extensibility.

**Concurrent participation.** Multiple Clients can participate in the same use case concurrently, each performing its part. No lock-step execution required.

**Timeline separation.** Components are decoupled along the timeline. A Client posts a message and continues. The Manager processes it when ready. Results come back asynchronously.

**High throughput.** The underlying queues can accept a very large number of messages per second.

---

## 4. The "Message Is the Application" Pattern

This is the most powerful operational concept supported by a message bus.

**Core idea:** There is no single collection of components you can point to as "the application." Instead, the system is a loose collection of services posting and receiving messages. Each service processes a message, does a unit of work, and posts a result back to the bus. Other services examine the result and some of them decide to act. The posting service has no knowledge of who (if anyone) will respond.

**Message transformation.** As a logical message traverses services, each service adds contextual information to headers, modifies context, or creates new messages from old ones. Services act as transformation functions on messages. The required behavior is the aggregate of all these transformations plus the local work each service performs.

**Change response.** When requirements change, you change how services respond to messages - not the architecture or the services themselves.

**Extensibility.** New behavior is added by adding new message-processing services, not by modifying existing ones. This is incremental construction: build by adding, not by iterating/reworking.

**Actor model alignment.** The Message Is the Application pattern is closely aligned with the actor model. Services are actors, projects are networks of actors, and the program IS the progression of messages through the network. This forward-looking design prepares the system for future architectural evolution.

---

## 5. Workflow Managers

All Managers in a Message-Bus-based system can be implemented as **workflow Managers**.

A workflow Manager:
1. Receives a message from the bus.
2. Loads the appropriate workflow type AND specific instance (with its state and context) from workflow storage.
3. Executes the next step in the workflow.
4. Persists the workflow instance back to the store.
5. Posts a result message back to the bus.

**Benefits:**
- Supports long-running workflows spanning multiple sessions, devices, and connections.
- Each call from the same user in the same workflow carries the workflow instance ID - the Manager loads, executes, persists. No session state needed.
- Connected single-session and long-running multi-device workflows are treated identically (symmetry).
- Adding or changing a feature = adding or changing workflows, not Manager implementation.

**Implementation:** Workflow Managers typically use a third-party workflow execution tool and dedicated workflow storage (ResourceAccess + Resource).

---

## 6. When to Use a Message Bus vs. Simpler Alternatives

A message bus adds complexity: additional infrastructure, new APIs, deployment concerns, security surface, failure scenarios.

### Use a Message Bus When:
- The system requires high extensibility and the organization can invest in a platform.
- Multiple subsystems need to communicate without awareness of each other.
- Long-running, multi-session workflows are core to the business.
- The "Message Is the Application" pattern is justified by business objectives.
- You have organizational backing (top-down and bottom-up) for the investment.

### Use Simpler Queued Calls When:
- The development team cannot absorb the complexity.
- The system is relatively simple with few subsystems.
- Clients can queue calls directly to known Managers.
- Organizational maturity doesn't support full message-bus infrastructure yet.

**Pragmatic guidance:** It's easier to morph architecture than to bend the organization. Start with simpler queued Client-to-Manager calls. When organizational capabilities mature, incorporate a full Message Bus and "Message Is the Application" pattern. Always calibrate architecture to the capability and maturity of developers and management.

---

## 7. TradeMe Interaction Pattern (Worked Example)

The TradeMe system demonstrates the Message Bus + "Message Is the Application" in practice.

### Static Architecture
- **Clients:** Tradesman Portal, Contractors Portal, Education Portal, Marketplace App, Timer
- **Managers:** Membership Manager, Market Manager, Education Manager
- **Engines:** Regulations Engine, Search Engine
- **ResourceAccess:** Regulations Access, Payments Access, Members Access, Projects Access, Contractors Access, Education Access, Workflows Access
- **Resources:** Corresponding storage for each
- **Utilities:** Security, Message Bus, Logging

### Typical Call Chain Pattern
Every use case follows the same structural pattern:
1. A Client posts a message to the Message Bus.
2. The appropriate Manager receives the message.
3. The Manager loads the relevant workflow from Workflows Access/Workflows store.
4. The Manager executes the workflow, consulting Engines and ResourceAccess as needed.
5. The Manager posts a result message back to the Message Bus.
6. Other Managers or Clients may pick up this message to continue their own workflows.
7. Clients monitor the bus to update users on progress.

### Inter-Manager Collaboration
Managers are unaware of each other. The Membership Manager posts a message; the Market Manager happens to subscribe to that message type and responds. Neither knows about the other - they only know about the bus. This is the essence of "Message Is the Application": the logical message (e.g., "assignment") weaves through services, triggering local behaviors as it goes.

### Symmetry
All use case call chains are structurally symmetric:
- First action: load workflow from storage.
- Middle: execute workflow steps using Engines and ResourceAccess.
- Last action: post result to Message Bus.
- Any error: post error message back to bus → Client receives notification.

This symmetry is a hallmark of good decomposition. Asymmetric call chains signal uneven volatility encapsulation.
