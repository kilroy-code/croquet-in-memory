const Constants = {};
const App = {};
class Model {
  static register() {
  }
  static create(properties, name, session = Session._currentSession) {
    let model = new this();
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
    this._session._subscribe(scope, event, handler, this);
  }
  publish(scope, event, data) {
    this._session._publish(scope, event, data);
  }
  init(properties) {
  }
  now() {
    return this.model._session._time;
  }
  destroy() {
    // remove subscriptions, etc.
  }
  future(milliseconds) {
    // e.g., this.future(50).foo(1, 2) => this._schedule(50, 'foo', 1, 2)
    return new Proxy(this, {
      get: function (target, key) {
	return (...args) => {
	  target._schedule(milliseconds, key, ...args);
	};
      }
    });
  }
  _schedule(deltaMS, name, ...args) {
    const ticks = this._session._ticks;
    ticks.push([
      this.now() + deltaMS,
      () => this[name](...args)
    ]);
    // fixme: sort it, too
  }
}
Model._counter = 0;
class View {
  update(frameTime) {
  }
  constructor(model) {
    this._model = model;
    let modelRoot = this.wellKnownModel('modelRoot'),
	session = modelRoot._session;
    // These are often referenced from subclass constructors.
    this.sessionId = session.id;
    this.viewId = session._viewId;
    this.id = (Model._counter++).toString();
  }
  wellKnownModel(name) {
    return this._model.wellKnownModel(name);
  }
  subscribe(scope, event, handler) {
    if (event.event) event = event.event; // For event-specs. (FIXME: support other specs)
    this._model._session._subscribe(scope, event, handler, this);
  }
  publish(scope, event, data) {
    this._model._session._publish(scope, event, data);
  }
  detach() {
    // fixme: remove subscriptions.
  }
}
class Session {
  constructor({tps = 20}) { // fixme: use tps
    this._time = performance.now(); // FIXME: Make per-session to support multiple simultaneous sessions.
    const ticks = this._ticks = [],
	  step = (frameTime) => {
	    // Context for execution messages:
	    Session._currentSession = this;
	    this._time = frameTime; // really message time
	    while (ticks.length && ticks[0][0] <= frameTime) {
	      const tick = ticks.pop();
	      tick[1]();
	    }
	    if (this.view) this.view.update(frameTime);
	    if (this._running) requestAnimationFrame(step);
	  };
    this.step = step.bind(this);
    this.id = "session"; // FIXME hash(properties.name + Croquet.constants + registered class sources)
    this._subscriptions = {};
    this._models = {};
    this._running = true;
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
      resolve(this._running = false);
      setTimeout(() => rootView.publish(this.view.sessionId, 'view-exit', this.view.viewId));
    }));
  }
  _subscribe(scope, event, handler, object) {
    //console.log('fixme subscribe', scope, event);
    this._subscriptions[scope+event] = handler.bind(object);
  }
  _publish(scope, event, data) {
    const subscription = this._subscriptions[scope+event];
    if (!subscription) return console.warn(`No subscription found for ${scope} ${event}.`); // Not an error!
    // FIXME: schedule in messages (ticks), so that the execution occurs within step, so that multiple sessions can refer to the right Session._currentSession.
    setTimeout(() => subscription(data));
  }
}
export const Croquet = {Model, View, Session, Constants, App};

