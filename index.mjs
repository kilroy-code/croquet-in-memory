// TODO:
// - Test case for multiple sessions. (Still one user per session. Useful now just to confirm that what we have here is actually right.)

// Not needed yet. (Use real Croquet.)
// - Snapshots and multiple participants. (In the same browser. The idea here is for controlled testing! Use real Croquet for multi-browser collaboration!)
// - Test case for multiple participants within a session
const Constants = {};
const App = {};
class Model {
  static register() {
  }
  static create(properties, name, session = Session._currentSession) {
    let model = new this();
    // Each model knows what session it belongs to. For modelRoot, this is captured by the secret third argument to create.
    // After that, we rely on the Model.create only being executed from within a Session.step(), in which Session._currentSession is set.
    model._session = session;
    if (name) model.beWellKnownAs(name);
    model.id = (Model._counter++).toString(); // Real Croquet has the same model.id for each of the "same" model for each user in the session.
    model.sessionId = session.id;
    model.init(properties);
    return model;
  }
  beWellKnownAs(name) {
    this._session._models[name] = this;
  }
  wellKnownModel(name) {
    return this._session._models[name];
  }
  subscribe(scope, event, handler) {
    this._session._subscribe(scope, event, this, handler, 'model');
  }
  publish(scope, event, data) {
    this._session._publish(scope, event, data);
  }
  init(properties) {
  }
  now() {
    return this._session._now;
  }
  destroy() {
    // remove subscriptions, etc.
  }
  future(milliseconds) {
    // e.g., this.future(50).foo(1, 2) => this._session._scheduleFuture(this, 'foo', [1, 2], 50)
    return new Proxy(this, {
      get(target, key) {
	return (...rest) => target._session._scheduleFuture(target, target[key], rest, milliseconds);
      }
    });
  }
}
Model._counter = 0;
class View {
  update(frameTime) {
  }
  constructor(model) {
    this._model = model;
    let session = model._session;
    // These are often referenced from subclass constructors.
    this.sessionId = session.id;
    this.viewId = session._viewId;
    this.id = (Model._counter++).toString();
  }
  wellKnownModel(name) {
    return this._model.wellKnownModel(name);
  }
  now() {
    return this._model._session._now;
  }
  externalNow() {
    return this._model._session._externalNow;
  }
  subscribe(scope, event, handler) {
    if (event.event) event = event.event; // For event-specs. (FIXME: support other specs)
    this._model._session._subscribe(scope, event, this, handler, 'view');
  }
  publish(scope, event, data) {
    this._model._session._publish(scope, event, data);
  }
  detach() {
    // fixme: remove subscriptions.
  }
}
class Subscription {
  constructor(object, handler, type) {
    Object.assign(this, {object, handler, type});
  }
  makePendingMessage(time, argument) {
    return new PendingMessage(time, this.object, this.handler, [argument]);
  }
}
class PendingMessage {
  constructor(time, object, handler, args) {
    Object.assign(this, {time, object, handler, args});
  }
  invoke() {
    const {object, handler, args} = this;
    handler.apply(object, args);
  }
}
class Session {
  _scheduleFuture(object, handler, args, deltaMS = 0) {
    this._scheduleMessage(new PendingMessage(
      this._now + deltaMS,
      object, handler, args, 'future'
    ));
  }
  _scheduleMessage(pendingMessage, type = 'model') {
    const isModel = type !== 'view', // future messages are also model, but do not advance time.
	  queue = isModel ? this._pendingModelMessages : this._pendingViewMessages;
    if (type === 'model') this._externalNow = pendingMessage.time;
    queue.push(pendingMessage);
    queue.sort((a, b) => a.time - b.time);
  }
  _subscribe(scope, event, object, handler, type) {
    // It is not clear to me if a model and view can both subscribe to the same scope/event.
    // I _think_ that I have had trouble doing so. Best to avoid.
    // In any case, here we assume that it is _not_ allowed.
    this._subscriptions[scope+event] = new Subscription(object, handler, type);
  }
  _publish(scope, event, data) {
    const subscription = this._subscriptions[scope+event];
    if (!subscription) return console.warn(`No subscription found for ${scope} ${event}.`); // Not an error!

    if (subscription.type === 'model') {
      this._send(subscription, data);
      /*
      setTimeout(() =>
	//subscription.makePendingMessage(this._now, data).invoke()
	this._scheduleMessage(subscription.makePendingMessage(this._now, data), subscription.type)
      );
      */
      return;
    }
    this._send(subscription, data);
    /*
    setTimeout(() =>
      //subscription.makePendingMessage(this._now, data).invoke()
      this._scheduleMessage(subscription.makePendingMessage(this._now, data), subscription.type)
    );
    */
  }
  _send(subscription, data) {
    setTimeout(() => {
      const isModel = subscription.type === 'model',
	    // model messages get timestamped by the router, and advance our time.
	    // view messages are executed in the same step they are issued.
	    time = isModel ? performance.now() : this._stepMax,  // Simulated heartbeat vis performance.now(). 
	    message = subscription.makePendingMessage(time, data);
      this._scheduleMessage(message, subscription.type);
    });
  }
  _step(frameTime) {
    // _externalNow is increased whenever a message is received. stepMax captures the externalNow at the start of the step.
    const stepMax = this._stepMax = this._externalNow,
	  executeUntil = (pendingMessages, stopTime) => {
	    while (pendingMessages.length && pendingMessages[0].time <= stopTime) {
	      const message = pendingMessages.pop();
	      this._now = message.time;
	      message.invoke();
	    }
	  };
    Session._currentSession = this; // Context for execution messages:
    executeUntil(this._pendingModelMessages, stepMax);
    executeUntil(this._pendingViewMessages, stepMax);	    
    // As of 6/22, Croquet does NOT wait for any asynchronous behavior in update. A long update does not delay requestAnimationFrame.
    if (this.view) this.view.update(frameTime);
    if (this._heartbeat) requestAnimationFrame(this.step);
  }
  constructor({tps = 20}) { // fixme: use tps
    this._now = this._externalNow = this._stepMax = performance.now();
    this._pendingModelMessages = [];
    this._pendingViewMessages = [];
    this.step = this._step.bind(this);
    this.id = "session"; // FIXME hash(properties.name + Croquet.constants + registered class sources)
    this._subscriptions = {};
    this._models = {};
    // Simulate receiving of heartbeat messages, by advancing externalNow.
    this._heartbeat = setInterval(() => this._externalNow = performance.now(), tps);
  }
  static join({model, view, ...properties}) {
    const session = new this(properties),
	  modelRoot = session.model = model.create(properties.options || {}, 'modelRoot', session),
	  sessionId = session.id,
	  viewId = session._viewId = "-1";

    requestAnimationFrame(session.step);    
    modelRoot.publish(modelRoot.sessionId, 'view-join', viewId);    
    const viewRoot = session.view = new view(modelRoot);

    return new Promise(resolve => setTimeout(() => {
      setTimeout(() => viewRoot.publish(viewId, 'synced', true));
      resolve(session);
    }));
  }
  leave() { // instance method
    const rootView = this.view;
    return new Promise(resolve => setTimeout(() => {
      rootView.detach();
      clearInterval(this._heartbeat);
      this._heartbeat = null;
      resolve();
      //setTimeout(() => rootView.publish(this.view.sessionId, 'view-exit', this.view.viewId));
    }));
  }
}
export const Croquet = {Model, View, Session, Constants, App};

