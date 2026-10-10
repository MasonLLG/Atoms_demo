// 预览运行时：注入到生成应用里的一小段脚本
// iframe 采用 sandbox（不含 allow-same-origin）隔离生成代码，此时原生 localStorage 不可用，
// 这里用一个由父页面持久化的 Storage 替身代替，并把运行错误回传给编辑器用于"一键修复"。

export const PREVIEW_CHANNEL = "__atoms_preview__";

export type PreviewMessage =
  | { channel: typeof PREVIEW_CHANNEL; type: "storage"; data: Record<string, string> }
  | { channel: typeof PREVIEW_CHANNEL; type: "error"; message: string };

const runtimeScript = (seed: Record<string, string>) => `<script>(function(){
var CH=${JSON.stringify(PREVIEW_CHANNEL)};
var data=${JSON.stringify(seed).replace(/</g, "\\u003c")};
function post(m){m.channel=CH;try{parent.postMessage(m,"*")}catch(e){}}
var timer=null;function sync(){clearTimeout(timer);timer=setTimeout(function(){post({type:"storage",data:data})},50)}
var store={
getItem:function(k){k=String(k);return Object.prototype.hasOwnProperty.call(data,k)?data[k]:null},
setItem:function(k,v){data[String(k)]=String(v);sync()},
removeItem:function(k){delete data[String(k)];sync()},
clear:function(){data={};sync()},
key:function(i){var ks=Object.keys(data);return i<ks.length?ks[i]:null},
get length(){return Object.keys(data).length}
};
try{Object.defineProperty(window,"localStorage",{value:store,configurable:true})}catch(e){}
try{Object.defineProperty(window,"sessionStorage",{value:store,configurable:true})}catch(e){}
window.addEventListener("error",function(e){post({type:"error",message:(e.message||"脚本错误")+(e.lineno?" (第 "+e.lineno+" 行)":"")})});
window.addEventListener("unhandledrejection",function(e){post({type:"error",message:"未处理的 Promise 异常："+String(e.reason)})});
})();</script>`;

export function buildPreviewDoc(html: string, seed: Record<string, string> = {}) {
  const inject = runtimeScript(seed);
  const head = html.match(/<head[^>]*>/i);
  if (head && head.index !== undefined) {
    const i = head.index + head[0].length;
    return html.slice(0, i) + inject + html.slice(i);
  }
  return inject + html;
}

export const storageKeyFor = (scope: string) => `atoms:appdata:${scope}`;

export function loadAppData(scope: string): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(storageKeyFor(scope)) || "{}");
  } catch {
    return {};
  }
}

export function saveAppData(scope: string, data: Record<string, string>) {
  try {
    localStorage.setItem(storageKeyFor(scope), JSON.stringify(data));
  } catch {
    // 存储已满或被禁用时忽略
  }
}
