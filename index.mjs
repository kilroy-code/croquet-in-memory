// TODO:
// - Test case for multiple sessions. (Still one user per session. Useful now just to confirm that what we have here is actually right.)

// Not needed yet. (Use real Croquet.)
// - Snapshots and multiple participants. (In the same browser. The idea here is for controlled testing! Use real Croquet for multi-browser collaboration!)
// - Test case for multiple participants within a session
const Constants = {};
const App = {};

import { performance } from '@kilroy-code/utilities/performance.mjs';
import {hidableDocument} from '@kilroy-code/hidden-tab-simulator/index.mjs';
var hash;
if (typeof(window) === 'undefined') {
  let {createHash} = await import('node:crypto');
  hash = async object => createHash('sha256').update(JSON.stringify(object)).digest('base64');
} else {
  hash = async object => {
    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify(object));
    let byteArray = await window.crypto.subtle.digest("SHA-256", data);
    return btoa(byteArray);
  };
}

var requestAnimationFrame;
if (!requestAnimationFrame) {
  requestAnimationFrame = handler => {
    let paint = _ => handler(performance.now());
    setTimeout(paint, 16);
  };
}

// FIXME: Very hacky and incomplete.
function replacer(key, value) { // We could incorporate subscriptions here....
  if (!key) return value;
  if (value instanceof Set) return {hacktype: 'Set', entries: Array.from(value.values())};
  if (value instanceof Map) return {hacktype: 'Map', entries: Array.from(value.entries())};
  return value;
}
function reviver(key, value) {
  switch (value?.hacktype) {
  case 'Set':
    return new Set(value.entries);
  case 'Map':
    return new Map(value.entries);
  default:
    return value;
  }
}


class Model {
  static register() {
  }
  static create(properties = {}, name, session = Session._currentSession) {
    let model = new this();
    model._init(session);
    if (name) model.beWellKnownAs(name);
    model.id = (session._idCounter++).toString();
    model.init(properties);
    return model;
  }
  init(properties) {
  }
  _init(session) {
    // Each model knows what session it belongs to. For modelRoot, this is captured by the secret third argument to create.
    // After that, we rely on the Model.create only being executed from within a Session.step(), in which Session._currentSession is set.
    this._session = session;
    this._subscriptions = [];
  }
  static fromModel(model, session) {
    let copy = new model.constructor(),
        modelSession = model._session,
        modelSubscriptions = model._subscriptions,
        subscriptions = model._subscriptions;
    // TODO: needs a real snapshot to work on trees of Models.
    model._session = model._subscriptions = null;
    Object.assign(copy, JSON.parse(JSON.stringify(model, replacer), reviver)); // Including id
    model._session = modelSession;
    model._subscriptions = modelSubscriptions;

    copy._init(session);
    subscriptions.forEach(({scope, event, handler}) => copy.subscribe(scope, event, handler));
    return copy
  }
  get sessionId() {
    return this._session.id;
  }
  get viewCount() {
    return this._session._viewCount;
  }
  beWellKnownAs(name) {
    this._session._models[name] = this;
  }
  wellKnownModel(name) {
    return this._session._models[name];
  }
  subscribe(scope, event, handler) {
    this._subscriptions.push({scope, event, handler});
    this._session._subscribe(scope, event, this, handler, 'model');
  }
  publish(scope, event, data) {
    this._session._publish(scope, event, data, 'model');
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

class View {
  update(frameTime) {
  }
  constructor(model) {
    this._model = model;
    let session = model._session;
    this.session = session; // Not documented, but Croquet does this.
    // These are often referenced from subclass constructors.
    this.sessionId = session.id;
    this.viewId = session._viewId;
    this.id = (session._idCounter++).toString();
  }
  wellKnownModel(name) {
    return this._model.wellKnownModel(name);
  }
  now() {
    return this.session._now;
  }
  externalNow() {
    return this.session._externalNow;
  }
  subscribe(scope, event, handler) {
    if (event.event) event = event.event; // For event-specs. (FIXME: support other specs)
    this.session._subscribe(scope, event, this, handler, 'view');
  }
  publish(scope, event, data) {
    this.session._publish(scope, event, data, 'view');
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
  // FIXME: support having a list of  multiple subscriptions for the same scope+event.
  _subscribe(scope, event, object, handler, type) {
    // It is not clear to me if a model and view can both subscribe to the same scope/event.
    // I _think_ that I have had trouble doing so. Best to avoid.
    // In any case, here we assume that it is _not_ allowed.
    this._subscriptions[scope+event] = new Subscription(object, handler, type);
  }
  _publish(scope, event, data, fromType) {
    if (['view-join', 'view-exit'].includes(event)) {
      let increment = event === 'view-join' ? 1 : -1,
          count = this._viewCount + increment;
      // FIXME: delay this until just before the message is received (even without subscription).
      Session.sessions.forEach(session => session._viewCount = count);
    }
    let subscription = this._subscriptions[scope+event];
    if ((fromType === 'view') && (subscription?.type === 'model')) {
      Session.sessions.forEach(session => session._send(scope, event, data));
    } else {
      this._send(scope, event, data);
    }
  }
  _send(scope, event, data) {
    const subscription = this._subscriptions[scope+event];
    if (!subscription) return ;//fixme restore: console.info(`No subscription found for ${scope} ${event}.`); // Not an error!
    // view messages are executed in the same step they are received, so use current step's time.
    if (subscription.type !== 'model') return this._receive(subscription, this._stepMax, data);
    // model messages get timestamped by the router, and advance our time.
    setTimeout(() => this._receive(subscription, performance.now(), data),
	       // We could simulate a network delay here, e.g, with a random time.
	       // Instead we stress things by occuring as soon as the semantics allow.
	       0);
  }
  _receive(subscription, time, data) {
    const message = subscription.makePendingMessage(time, data);
    this._scheduleMessage(message, subscription.type);
  }
  _checkBacklog() {
    // Real Croquet can repeated fall behind and sync. Here we just do a one-shot.
    if (this.synced || !this.view) return;
    this.view.publish(this._viewId, 'synced', true);
    this.synced = true;
  }
  _step(frameTime) {
    // _externalNow is increased whenever a message is received. stepMax captures the externalNow at the start of the step.
    const stepMax = this._stepMax = this._externalNow,
	  executeUntil = (pendingMessages, stopTime) => {
	    while (pendingMessages.length && pendingMessages[0].time <= stopTime) {
	      const message = pendingMessages.shift();
	      this._now = message.time;
	      message.invoke();
	    }
	  };
    Session._currentSession = this; // Context for execution messages:
    executeUntil(this._pendingModelMessages, stepMax);
    this._now = stepMax;
    executeUntil(this._pendingViewMessages, stepMax);	    
    this._checkBacklog();
    // As of 6/22, Croquet does NOT wait for any asynchronous behavior in update. A long update does not delay requestAnimationFrame.
    if (this.view) this.view.update(frameTime);
  }

  static viewCounter = 1;
  constructor({tps = 20, autoSleep = 10, id, name, step = "auto", viewOptions = {}}) {
    this._now = this._externalNow = this._stepMax = performance.now();
    this._pendingModelMessages = [];
    this._pendingViewMessages = [];
    this._viewOptions = viewOptions;
    this._isAutostep = step !== "manual";
    this.step = this._step.bind(this);
    this.id = id;
    this.name = name;
    Session.sessions.push(this);
    this._viewId = (-Session.viewCounter++).toString();
    this._subscriptions = {};
    this._models = {};
    this._idCounter = 0;
    this._tps = tps;
    let matchingSession = Session.sessions.find(session => session.id === id)
    this._viewCount = matchingSession?._viewCount || 0;

    // Each session can have its own autoSleep time.
    if (!autoSleep) return;
    this._autoSleep = _ => {
      if (hidableDocument.visibilityState === 'hidden') {
	this._pendingTimeout = setTimeout(_ => {
	  console.log('pausing...');
	  this._pause();
	}, autoSleep * 1000);
      } else if (this._pendingTimeout) {
	console.log('...resuming');
	clearTimeout(this._pendingTimeout);
	this._pendingTimeout = null;
	this._resume();
      }
    };
    hidableDocument.addEventListener('visibilitychange', this._autoSleep);
  }
  _resume() {
    // Simulate receiving of heartbeat messages, by advancing externalNow.
    this._heartbeat = setInterval(() => this._externalNow = performance.now(), 1000 / this._tps);
    if (this._isAutostep) {
      const step = time => {
        this.step(time);
        if (this._heartbeat) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
    Session._currentSession = this;
    this.model.publish(this.id, 'view-join', this._viewId);
    this.view = new this._viewType(this.model, this._viewOptions);
  }
  _pause() {
    Session._currentSession = this;
    this.view.detach();
    this.view.session = null; // Because that's what Croquet does.
    this.model.publish(this.id, 'view-exit', this._viewId); // We will not see it, but others might.
    clearInterval(this._heartbeat);
    this._heartbeat = null;
  }
  static async join(properties) {
    const {model, view, appId, name = "session", options = {}, ...otherProperties} = properties,
          id = await hash({appId, name, otherProperties}), // include version
          existing = Session.sessions.find(session => session.id === id),
          session = Session._currentSession = new this({id, name, ...otherProperties}); // During the creation of models and views, the _currentSession is set.
    session.model = existing ? Model.fromModel(existing.model, session) : model.create(options, 'modelRoot', session);
    session._viewType = view;
    session._resume();
    return session;
  }
  async leave() { // instance method
    this._pause();
    hidableDocument.removeEventListener('visibilitychange', this._autoSleep);
    Session.sessions = Session.sessions.filter(session => session !== this);
  }
}
Session.sessions = [];
export const Croquet = {Model, View, Session, Constants, App, fake: true};
