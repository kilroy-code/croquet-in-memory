# croquet-in-memory

[Croquet OS](https://croquet.io/croquet-os/index.html) is a distributed, multi-user protocol for the Web. 

croquet-in-memory is a sloppy implementation of some of the API that only supports one user, with no server and no persistence.

**The purpose is to facilitate development and testing.** For example:

- Develop initial versions of applications without storage and always having a fresh session.

- Test in controlled ways, in which your test case carefully arranges for one particular message to always arrive before message 2.

- While croquet-in-memory does not support multiple users, it does support multiple sessions within the same browser window, as if they were two different users in two different browsers. This allows test suites to work out the behavior between parties, without needing to run two browser instances.

- It works (single-user and no-persistence) in NodeJS as well as browser. So test suites can be run in either. This allows command-line testing without having to use, e.g, [Puppeteer](https://pptr.dev/) (which is terrific and there are places where I use it, but sometimes it is more than I need).

## Usage

```
import { Croquet } from './@kilroy-code/croquet-in-memory/index.mjs';

Croquet.fake; // => true, while of course, this is falsy in real Croquet.
```
Everything else that is defined on real `Croquet` from Croquet OS should be mostly the same here, subject to being single-user and no persistence.

## Tests

The Jasmine test suite, such as it is, also works in real Croquet in a browser. See the first comment in `spec/spec.js to see how to switch between the two.

 