# croquet-in-memory

[Croquet OS](https://croquet.io/croquet-os/index.html) is a distributed, multi-user protocol for the Web. 

croquet-in-memory is a sloppy implementation of some of the API that only supports one user. The purpose is to facilitate development and testing. For example:

- Develop initial versions of applications without storage and always having a fresh session.

- Test in controlled ways, in which your test case carefully arranges for one particular message to always arrive before message 2.

## Usage

```
import { Croquet } from './@kilroy-code/croquet-in-memory/index.mjs';
```
 