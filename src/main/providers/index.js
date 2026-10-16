'use strict';
/** 모델 공급자 선택. 지금은 OpenAI(GPT). --mock 이면 목업(키 없이 화면·흐름 확인용). */
let mock = false;
function setMock(v) { mock = !!v; }
function get() { return mock ? require('./mock') : require('./openai'); }
function isMock() { return mock; }
module.exports = { get, setMock, isMock };
