/*global describe, it, require*/

//import { Croquet } from '../index.mjs';
import { getKey } from '../../api-key/index.mjs';

Croquet.App.root = false; // Disable the default Croquet overlay so we can see Jasmine report from start to finish.
describe('Croquet', function () {
  let apiKey;
  beforeAll(async function () {
    apiKey = await getKey('croquet');
  });
  describe('Session', function () {
    it('smokes', function (done) {
      let results = [], synced = false;
      function record(message, arg, reportOnlyIfSynced) {
	//console.log(message, arg);
	if (reportOnlyIfSynced && !synced) return;
	results.push([message, arg]);
      }
      class MyModel extends Croquet.Model {
	init(properties) {
	  super.init(properties);
	  record('init', properties.options);
	  this.cycles = 2;
	  this.subscribe(this.sessionId, 'view-join', this.join);
	  this.subscribe(this.sessionId, 'view-exit', this.exit);	  
	}
	join(viewId) {
	  record('join', viewId, true);
	  this.cycles = 2; // In real Croquet, reload gives us the same model in which we wound cycles down. Reset it here.
	  this.subscribe(viewId, 'replicated', this.replicated);
	}
	exit(viewId) {
	  record('exit', viewId, true);
	}
	replicated(viewId) {
	  record('replicated', viewId, true);
	  this.publish(viewId, 'view', 42);
	  if (--this.cycles > 0) this.future(100).replicated(viewId);
	}
      }
      class MyView extends Croquet.View {
	constructor(model) {
	  super(model);
	  this.model = model;
	  record('construct', model.constructor.name);
	  this.subscribe(this.viewId, 'view', this.view);
	  this.subscribe(this.viewId, 'synced', this.synced);	  
	}
	synced(isRevealed) {
	  synced = true;
	  record('synced', isRevealed);
	}
	detach() {
	  record('detach', this.viewId);
	  super.detach();
	}
	view(x) {
	  record('view', x);
	  if (this.model.cycles > 0) return;
	  this.viewSession.leave().then(() => {
	    expect(results).toEqual([
	      ['init', 'options'],
	      ['construct', 'MyModel'],
	      ['session', this.viewSession.id],
	      ['synced', true],

	      ['replicated', this.viewId],
	      ['view', 42],

	      ['replicated', this.viewId],
	      ['view', 42],
	      
	      ['detach', this.viewId]
	    ]);
	    done();
	  });
	}
	userDoesSomething() {
	  this.publish(this.viewId, 'replicated', this.viewId);
	}
      }
      [MyModel].forEach(kind => kind.register(kind.name));
      Croquet.Session.join({
	  appId: "com.ki1r0y.fake",
	  name: "x4",
	  apiKey,
	  password: "secret",
	  model: MyModel,
	  view: MyView,
	  options: {options: 'options'}
	})
	.then(session => {
	  record('session', session.id);
	  session.view.viewSession = session; // Real Croquet has an undocumented read-only property called session.
	  setTimeout(() =>
	    session.view.userDoesSomething()
	    , 1000);
	});
    });
  });
  describe('two sessions', function () {
    let sessionA, sessionB;
    class TwinnedModel extends Croquet.Model {
      init(properties) {
	super.init(properties);
	this.subscribe(this.id, 'm', this.m);
      }
      m(x) {
	this.publish(this.id, 'v', x);
      }
    }
    class TwinnedView extends Croquet.View {
      constructor(model) {
	super(model);
	this.subscribe(model.id, 'v', this.v);
      }
      v(x) {
	this.session.gotViewMessage = true;
      }
    }
    TwinnedModel.register("TwinnedModel"); // Can't be the same name browser session in real Croquet, even if they're used by different sessions.
    beforeAll(async function () {
      let options = {
	appId: "com.ki1r0y.fake",
	name: "multiple",
	apiKey,
	password: "secret",
	model: TwinnedModel,
	view: TwinnedView,
	options: {options: 'options'}
      };
      sessionA = await Croquet.Session.join(options);
      sessionB = await Croquet.Session.join(options);
    });
    afterAll(async function () {
      sessionA.leave();
      sessionB.leave();
    });
    it('delivers to all participants.', async function () {
      sessionA.view.publish(sessionA.model.id, 'm', 99);
      await new Promise(resolve => setTimeout(resolve, 500));
      expect(sessionA.gotViewMessage).toBeTruthy();
      expect(sessionB.gotViewMessage).toBeTruthy();
    });
  });
});
