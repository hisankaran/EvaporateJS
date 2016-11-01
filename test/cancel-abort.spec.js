import { expect } from 'chai'
import sinon from 'sinon'
import test from 'ava'

// constants

let server

function testCancel(t, addConfig) {
  addConfig = addConfig || {}

  addConfig.xAmzHeadersCommon = Object.assign({}, t.context.baseAddConfig.xAmzHeadersCommon, addConfig.xAmzHeadersCommon)

  const config = Object.assign({}, {
    started: sinon.spy(),
    cancelled: sinon.spy()
  },
      addConfig)

  return testBase(t, config)
      .then(function () {
        return t.context.cancel()
      })

}

test.before(() => {
  sinon.xhr.supportsCORS = true
  global.XMLHttpRequest = sinon.useFakeXMLHttpRequest()
  global.window = {
    localStorage: {},
    console: console
  };

  server = serverCommonCase()
})

test.beforeEach((t) => {
  let testId = 'cancel-abort/' + t.title
  if (testId in testContext) {
    console.error('Test case must be uniquely named:', t.title)
    return
  }

  t.context.attempts = 0
  t.context.maxRetries = 1
  t.context.retry = function (type) {}

  t.context.testId = testId
  t.context.requestedAwsObjectKey = randomAwsKey()
  t.context.requests = []
  t.context.getPartsStatus = 200

  t.context.baseAddConfig = {
    name: t.context.requestedAwsObjectKey,
    file: new File({
      path: '/tmp/file',
      size: 12000000,
      name: randomAwsKey()
    }),
    xAmzHeadersAtInitiate: {testId: testId},
    xAmzHeadersCommon: { testId: testId },
    maxRetryBackoffSecs: 0.1,
    abortCompletionThrottlingMs: 0
  }

  t.context.cryptoMd5 = sinon.spy(function () { return 'md5Checksum'; })

  t.context.cancel = function () {
    return t.context.evaporate.cancel(t.context.uploadId)
  }

  testContext[testId] = t.context
})

// Default Setup: V2 signatures, Cancel
test('should Cancel an upload', (t) => {
  return testCancel(t)
      .then(function () {
        expect(t.context.config.started.callCount).to.equal(1)
        expect(t.context.config.cancelled.callCount).to.equal(1)
        expect(requestOrder(t)).to.equal('initiate,PUT:partNumber=1,PUT:partNumber=2,complete,cancel,check for parts')
      })
})
test.todo('should cancel an upload while parts are uploading')

// Cancel (xAmzHeadersCommon)
test('should set xAmzHeadersCommon on Cancel', (t) => {
  const config = {
    xAmzHeadersCommon: {
      'x-custom-header': 'stopped'
    }
  }

  t.context.retry = function (type) {
    return ['cancel', 'get parts'].indexOf(type) > -1
  }

  return testCancel(t, config)
      .then(function () {
        t.context.cancel()
            .then(function () {
              expect(headersForMethod(t, 'DELETE')['x-custom-header']).to.equal('stopped')
            })
      })
})

// retry
// TODO: DRY Up the common stuff
test('should not retry Cancel but trigger Initiate if status is 404 with started callback', (t) => {
  t.context.deleteStatus = 404
  return testCancel(t)
      .then(function () {
        expect(t.context.config.started.callCount).to.equal(1)
      })
})
test('should not retry Cancel but trigger Initiate if status is 404 with cancelled callback', (t) => {
  t.context.deleteStatus = 404
  return testCancel(t)
      .then(function () {
        expect(t.context.config.cancelled.callCount).to.equal(1)
      })
})
test('should not retry Cancel but trigger Initiate if status is 404 in the correct order', (t) => {
  t.context.deleteStatus = 404
  return testCancel(t)
      .then(function () {
        expect(requestOrder(t)).to.equal('initiate,PUT:partNumber=1,PUT:partNumber=2,complete,cancel')
      })
})

test('should retry Cancel twice if status is non-404 error with started callback', (t) => {
  t.context.deleteStatus = 403
  return testCancel(t)
      .then(function () {
        expect(t.context.config.started.callCount).to.equal(1)
      })
})
test('should retry Cancel twice if status is non-404 error with cancelled callback', (t) => {
  t.context.deleteStatus = 403
  return testCancel(t)
      .then(function () {
        expect(t.context.config.cancelled.callCount).to.equal(0)
      })
})
test('should retry Cancel twice if status is non-404 error in the correct order', (t) => {
  t.context.deleteStatus = 403
  return testCancel(t)
      .then(function () {
        expect(requestOrder(t)).to.equal('initiate,PUT:partNumber=1,PUT:partNumber=2,complete,cancel,cancel')
      })
})

test('should not retry check for aborted parts if status is 404 with status callback', (t) => {
  t.context.getPartsStatus = 404
  return testCancel(t)
      .then(function () {
        expect(t.context.config.started.callCount).to.equal(1)
      })
})
test('should not retry check for aborted parts if status is 404 with cancelled callback', (t) => {
  t.context.getPartsStatus = 404
  return testCancel(t)
      .then(function () {
        expect(t.context.config.cancelled.callCount).to.equal(1)
      })
})
test('should not retry check for aborted parts if status is 404 in the correct order', (t) => {
  t.context.getPartsStatus = 404
  return testCancel(t)
      .then(function () {
        expect(requestOrder(t)).to.equal('initiate,PUT:partNumber=1,PUT:partNumber=2,complete,cancel,check for parts')
      })
})

test('should retry check for remaining aborted parts twice if status is non-404 error with started callback', (t) => {
  t.context.getPartsStatus = 403
  return testCancel(t)
      .then(function () {
        expect(t.context.config.started.callCount).to.equal(1)
      })
})
test('should retry check for remaining aborted parts twice if status is non-404 error with cancelled callback', (t) => {
  t.context.getPartsStatus = 403
  return testCancel(t)
      .then(function () {
        expect(t.context.config.cancelled.callCount).to.equal(1)
      })
})
test('should retry check for remaining aborted parts twice if status is non-404 error in the correct order', (t) => {
  t.context.getPartsStatus = 403
  return testCancel(t)
      .then(function () {
        expect(requestOrder(t)).to.equal('initiate,PUT:partNumber=1,PUT:partNumber=2,complete,cancel,check for parts,check for parts')
      })
})