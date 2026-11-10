import './helpers/string-colors.js';
import { reActCrashChainMain } from './patterns/reAct/reAct-loop.js';
import { reActCrashPlatformMain } from './patterns/reAct/reAct-homework.js';
// import { getMessageFromModel, getMessageFromModelFailSafe } from './actions/get-message-model.js';
//import { toolUseMain } from './patterns/tool-use/tool-use.js';

console.clear();

await reActCrashChainMain();
// await reActCrashPlatformMain();
