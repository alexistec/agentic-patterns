import './helpers/string-colors.js';
import { planningMain } from './patterns/planning/planning.js';
import { reflectionMain } from './patterns/reflection/reflection.js';
// import { getMessageFromModel, getMessageFromModelFailSafe } from './actions/get-message-model.js';
//import { toolUseMain } from './patterns/tool-use/tool-use.js';

console.clear();

await reflectionMain();
