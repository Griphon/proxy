'use strict';
var EndpointFactory = require('../lib/Endpoint');
var _ = require('lodash');
var fs = require('fs');
var sinon = require('sinon');
var Socket = require('../test/helpers/Socket');
var t = require('chai').assert;

describe('Endpoint', function () {
  var Endpoint, E, log, jsonPackage, tls, process;
  var HOSTNAME = 'ssl.redsmin.dev';
  var PORT = 433;

  beforeEach(function (done) {
    jsonPackage = {
      version: '1.2.1'
    };
    tls = {
      connect: tconnect()
    };
    log = {
      debug: sinon.spy(),
      info: sinon.spy(),
      error: sinon.spy()
    };
    process = {
      exit: sinon.spy()
    };
    Endpoint = EndpointFactory(log, jsonPackage, tls, process);
    E = new Endpoint(stubLocalClient(), 'myKey', {
      initialTimeout: 1,
      maxTimeout: 10
    });

    done();
  });

  afterEach(function (done) {
    done();
  });

  it('should connect (without handshake)', function (done) {
    var hostname = 'ssl.redsmin.dev',
      port = 433,
      stub = sinon.stub();

    tls.connect = tconnect();

    t.equal(E.handshaken, false);
    t.equal(E.connected, false);

    E.on('connect', function () {
      t.equal(E.hostname, hostname);
      t.equal(E.port, port);
      done();
    });

    E.connect(port, hostname);

  });

  it('should connect without arguments should throw an error', function (done) {
    t.throws(function () {
      E.connect();
    });

    t.throws(function () {
      E.connect(443);
    });

    done();
  });

  it('should connect (with handshake)', function (done) {
    var hostname = 'ssl.redsmin.dev',
      port = 433,
      stub = sinon.stub();

    var fnWrite = sinon.spy(function (data) {
      t.equal(data, JSON.stringify({
        version: jsonPackage.version,
        key: E.key
      }));
      t.equal(E.connected, true);
    });

    tls.connect = tconnect(null, null, null, fnWrite);

    E.key = 'myKey';

    E.on('connect', function () {
      t.strictEqual(fnWrite.called, true, 'fnWrite was called');
      t.ok(true);
      done();
    });

    E.connect(port, hostname);
  });

  it('should connect with auth (with handshake)', function (done) {
    var E = new Endpoint(stubLocalClient(), 'myKey', {
      auth: "passw_or_d"
    });
    var hostname = 'ssl.redsmin.dev';
    var port = 433;

    var fnWrite = sinon.spy(function (data) {
      t.equal(data, JSON.stringify({
        version: jsonPackage.version,
        key: E.key,
        auth: "passw_or_d"
      }));
      t.equal(E.connected, true);
    });

    tls.connect = tconnect(null, null, null, fnWrite);

    E.key = 'myKey';

    E.on('connect', function () {
      t.strictEqual(fnWrite.called, true, 'fnWrite was called');
      t.ok(true);
      done();
    });

    E.connect(port, hostname);
  });

  it('should connect (with handshake backoff)', function (done) {
    var iConnect = 0;
    var iWrite = 0;
    var stub = sinon.stub();

    tls.connect = tconnect(null, null, null, function fnWriteToRedsmin(data) {
      iWrite++;
      if (iWrite === 1) {
        t.strictEqual(data, JSON.stringify({
          "version": jsonPackage.version,
          "key": E.key
        }));
      }
      if (iWrite === 2) {
        t.strictEqual(iConnect, 1);
        t.ok(!this.handshaken, 'handshaken');
        t.equal(data, JSON.stringify({
          version: jsonPackage.version,
          key: E.key
        }));
        t.equal(E.connected, true);
        done();
      }
    });

    E.key = 'myKey';
    E.on('connect', function () {
      ++iConnect;
      if (iConnect === 1) {
        t.ok(this.connected, 'connected');
        t.ok(!this.handshaken, 'handshaken');
        // Simulate a disconnection
        E.onClose();
      }
    });

    E.connect(PORT, HOSTNAME);
  });

  it('should onData (handhsake with error)', function (done) {
    var hostname = 'ssl.redsmin.dev',
      port = 433;

    tls.connect = tconnect();

    var processExit = process.exit = sinon.spy();

    E.on('connect', function () {
      E.onData('{"error":"oups user not found"}');
      t.equal(E.handshaken, false);
      t.ok(processExit.calledOnce, "backoff called");
      done();
    });

    E.connect(port, hostname);
  });

  it('should onData (handshake)', function (done) {
    var hostname = 'ssl.redsmin.dev',
      port = 433;

    tls.connect = tconnect();

    E.on('connect', function () {
      var spy = sinon.spy(E.fnWrite);
      t.equal(E.handshaken, false, "shouldn't be handshaken at this stage");
      E.onData('{"status":"ok"}');
      t.equal(E.handshaken, true, "should now be handshaken");
      t.ok(!spy.called, "it's the handshake datas shouldn't be written to the client");
      done();
    });

    E.connect(port, hostname);
  });

  it('should onData (handshake merge with info)', function (done) {
    var hostname = 'ssl.redsmin.dev',
      port = 433,
      redisInfo = "*1\n$4\ninfo";

    tls.connect = tconnect();

    E.on('connect', function () {
      var spy = sinon.spy(E, 'fnWrite');
      t.equal(E.handshaken, false, "shouldn't be handshaken at this stage");
      E.onData("{\"success\":\"true\"}" + redisInfo);
      t.equal(E.handshaken, true, "should now be handshaken");
      t.ok(spy.calledWith(redisInfo), "the command has the right arguments");
      done();
    });

    E.connect(port, hostname);
  });


  it('should onData (handshaken)', function (done) {
    var spyFnWrite = sinon.spy(),
      E = new Endpoint(spyFnWrite, 'myKey'),
      hostname = 'ssl.redsmin.dev',
      port = 433;

    tls.connect = tconnect();

    E.on('connect', function () {
      E.onData('KEYS *');
      t.ok(spyFnWrite.calledWith('KEYS *'), "localclient write called");
      done();
    });

    // Simulate that handshake as already be done
    E.handshaken = true;
    E.connect(port, hostname);
  });

  it('should onClose', function (done) {
    var hostname = 'ssl.redsmin.dev',
      port = 433;

    tls.connect = tconnect();

    E.on('close', function () {
      t.equal(E.connected, false);
      done();
    });

    E.on('connect', _.once(function () {
      // Emulate an "on close" event
      E.onClose(new Error('close'));
    }));

    E.connect(port, hostname);
  });

  it('should onClose (reconnect)', function (done) {

    tls.connect = tconnect();

    var E = new Endpoint(stubLocalClient(), 'myKey', {
        initialTimeout: 1,
        maxTimeout: 10
      }),
      hostname = 'ssl.redsmin.dev',
      port = 433;

    var spy = sinon.spy(E, "onConnected");

    E.on('connect', function () {
      t.ok(true, "connect called");

      if (spy.callCount === 0) {
        t.ok(!this.handshaken, "handshake");
      }

      if (spy.callCount === 2) {
        t.ok(!this.handshaken, "handshake");
        E._connect = function () {};
        done();
        return;
      }

      setImmediate(_.bind(E.onClose, E, new Error('close')));
    });

    // Simulate that the handshake was already done
    E.handshaken = true;
    E.connect(port, hostname);
  });

  it('should reconnect after a connect', function (done) {
    tls.connect = tconnect();

    var E = new Endpoint(stubLocalClient(), 'myKey'),
      hostname = 'ssl.redsmin.dev',
      port = 433;

    // 1 - the first connect to ssl.redsmin.com will pass as well as the handshake
    tls.connect = tconnect(null, null, null, function (data) {
      E.socket.emit('data', JSON.stringify({}));

      function simulateCloseEvent() {
        var step = 0;
        // 2 - now override the connection to ssl.redsmin.com in order to simulate an connect error
        tls.connect = function () {
          simulateECONNREFUSED();

          if(++step === 2){
            tls.connect = tconnect(null, null, null, function (data) {
              E.socket.emit('data', JSON.stringify({}));
              // 3 - connect should be called again
              done();
            });
          }


          return new Socket(_.noop);
        };

        E.socket.emit('close');
      }

      function simulateECONNREFUSED() {
        setTimeout(function(){
          var err = new Error('ECONNREFUSED');
          err.message = 'ECONNREFUSED';
          E.socket.emit('error', err);
        }, 50);
      }

      setTimeout(simulateCloseEvent, 50);
    });

    E.connect(port, hostname);
  });

  it('should onError', function (done) {
    var hostname = 'ssl.redsmin.dev',
      port = 433;

    E.on('connect', function () {
      var spy = sinon.spy(E.socket, "destroy");
      E.socket.emit('error');

      E.removeAllListeners();
      E.socket.removeAllListeners();

      t.ok(spy.called, 'destroy called');
      done();
    });

    E.handshaken = true;
    E.connect(port, hostname);
  });
});

function tconnect(t, host, hostname, fnWriteStub) {
  return function (_host, _hostname, cb) {
    if (t) {
      t.strictEqual(_host, host);
      t.strictEqual(_hostname, hostname);
    }

    process.nextTick(cb);
    return new Socket(fnWriteStub);
  };
}


function stubLocalClient(fn) {
  return fn || _.noop;
}
