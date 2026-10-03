export const getPrefs=():any=>{try{return JSON.parse(localStorage.getItem('fd-prefs')||'{}')}catch{return{}}}
export function setPref(k:string,v:string){const p={...getPrefs(),[k]:v};localStorage.setItem('fd-prefs',JSON.stringify(p));(document.documentElement.dataset as any)[k]=v}
