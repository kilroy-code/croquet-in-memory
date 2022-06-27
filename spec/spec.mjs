/*global describe, it, require*/

import { Croquet } from '../index.mjs';

Croquet.App.root = false; // Disable the default Croquet overlay so we can see Jasmine report from start to finish.
describe('Croquet', function () {
  describe('Session', function () {
    it('smokes', function (done) {
      let results = [], synced = false;
      function record(message, arg, reportOnlyIfSynced) {
	console.log(message, arg);
	if (reportOnlyIfSynced && !synced) return;
	results.push([message, arg]);
      }
      class MyModel extends Croquet.Model {
	init(properties) {
	  super.init(properties);
	  record('init', properties.options);
	  this.subscribe(this.sessionId, 'view-join', this.join);
	  this.subscribe(this.sessionId, 'view-exit', this.exit);	  
	}
	join(viewId) {
	  record('join', viewId, true);
	  this.subscribe(viewId, 'replicated', this.replicated);
	}
	exit(viewId) {
	  record('exit', viewId, true);
	}
	replicated(viewId) {
	  record('replicated', viewId, true);
	  this.publish(viewId, 'view', 42);
	}
      }
      class MyView extends Croquet.View {
	constructor(model) {
	  super(model);
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
	  this.viewSession.leave().then(() => {
	    expect(results).toEqual([
	      ['init', 'options'],
	      ['construct', 'MyModel'],
	      ['session', this.viewSession.id],
	      ['synced', true],
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
	name: "x3",
	apiKey: "1HfEipivkN9GP15g8f5lqKAhz7lls49Mi7nFnFKJg",
	password: "secret",
	model: MyModel,
	view: MyView,
	options: {options: 'options'}
      }).then(session => {
	record('session', session.id);
	session.view.viewSession = session; // Real Croquet has an undocumented read-only property called session.
	setTimeout(() =>
	  session.view.userDoesSomething()
	  , 1000);
      });
    });
  });
});
