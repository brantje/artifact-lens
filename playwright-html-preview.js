(() => {
  const previousOpen = window.openArtifactFilePreviewEncoded;
  const previousClose = window.closeArtifactFilePreview;
  const modal = document.querySelector('#filePreviewModal');
  const title = document.querySelector('#filePreviewTitle');
  const meta = document.querySelector('#filePreviewMeta');
  const body = document.querySelector('#filePreviewBody');
  const tabs = document.querySelector('#filePreviewTabs');
  const renderedTab = document.querySelector('#filePreviewRenderedTab');
  const sourceTab = document.querySelector('#filePreviewSourceTab');
  const download = document.querySelector('#filePreviewDownload');
  const close = document.querySelector('#filePreviewClose');
  const MAX_BYTES = 5 * 1024 * 1024;
  let state = null;
  let activeBlobUrl = null;

  function isHtml(file) {
    return /\.html?$/i.test(file?.name || '');
  }

  function isPlaywrightReport(source) {
    return /Playwright\s+Test\s+Report/i.test(source)
      || /playwrightReportBase64/i.test(source)
      || (/playwright-report/i.test(source) && /<script\b/i.test(source));
  }

  function sourceView(source) {
    const pre = document.createElement('pre');
    pre.className = 'source-preview';
    pre.textContent = source;
    return pre;
  }

  function revokeBlobUrl() {
    if (!activeBlobUrl) return;
    URL.revokeObjectURL(activeBlobUrl);
    activeBlobUrl = null;
  }

  function runtimeShim() {
    return `<script>(function(){
      function memoryStorage(){
        var values=new Map();
        var api={
          get length(){return values.size},
          key:function(i){return Array.from(values.keys())[i]??null},
          getItem:function(k){k=String(k);return values.has(k)?values.get(k):null},
          setItem:function(k,v){values.set(String(k),String(v))},
          removeItem:function(k){values.delete(String(k))},
          clear:function(){values.clear()}
        };
        return new Proxy(api,{
          get:function(target,key){
            if(key in target){var value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}
            key=String(key);return values.has(key)?values.get(key):undefined;
          },
          set:function(target,key,value){
            if(key in target)return Reflect.set(target,key,value,target);
            values.set(String(key),String(value));return true;
          },
          deleteProperty:function(target,key){values.delete(String(key));return true;},
          ownKeys:function(){return Array.from(values.keys());},
          getOwnPropertyDescriptor:function(target,key){if(values.has(String(key)))return{configurable:true,enumerable:true,writable:true,value:values.get(String(key))};return Object.getOwnPropertyDescriptor(target,key);}
        });
      }
      window.__artifactLensStorage=memoryStorage();
      function report(type,value){try{parent.postMessage({__artifactLensPlaywright:true,type:type,message:String(value&&value.message||value||'Unknown error'),stack:String(value&&value.stack||'')},'*')}catch(_){}}
      window.addEventListener('error',function(e){report('error',e.error||e.message)});
      window.addEventListener('unhandledrejection',function(e){report('error',e.reason)});
      window.addEventListener('load',function(){setTimeout(function(){var root=document.querySelector('#root');report(root&&root.childElementCount?'ready':'empty',root&&root.childElementCount?'mounted':'Playwright loaded but #root is empty')},250)});
    })();<\/script>`;
  }

  function withRestrictedRuntime(source) {
    // Opaque sandbox origins cannot access native localStorage. Playwright's report
    // uses both Storage methods and property access, so route the identifier to an
    // in-memory compatibility object before its bundle executes.
    const patched = source.replace(/\blocalStorage\b/g, 'window.__artifactLensStorage');
    const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob: data:; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data: blob:; connect-src data: blob:; worker-src blob: data:; child-src blob: data:; frame-src blob: data:; object-src 'none'; base-uri 'none'; form-action 'none'; manifest-src 'none'">`;
    const injected = `${csp}${runtimeShim()}`;
    if (/<head\b[^>]*>/i.test(patched)) return patched.replace(/<head\b[^>]*>/i, (head) => `${head}${injected}`);
    return `<!doctype html><html><head>${injected}</head><body>${patched}</body></html>`;
  }

  function renderedView(source, file) {
    revokeBlobUrl();
    const iframe = document.createElement('iframe');
    iframe.className = 'html-preview-frame playwright-report-frame';
    iframe.setAttribute('sandbox', 'allow-scripts');
    iframe.setAttribute('referrerpolicy', 'no-referrer');
    iframe.title = `${file.name} Playwright report`;
    activeBlobUrl = URL.createObjectURL(new Blob([withRestrictedRuntime(source)], { type: 'text/html' }));
    iframe.src = activeBlobUrl;
    return iframe;
  }

  function showRuntimeError(message, stack = '') {
    if (!state || state.mode !== 'rendered') return;
    let notice = body.querySelector('.playwright-runtime-error');
    if (!notice) {
      notice = document.createElement('div');
      notice.className = 'error file-preview-error playwright-runtime-error';
      body.prepend(notice);
    }
    notice.textContent = `Playwright report runtime error: ${message}${stack ? `\n${stack}` : ''}`;
  }

  function onRuntimeMessage(event) {
    const data = event.data;
    if (!state || !data?.__artifactLensPlaywright) return;
    if (data.type === 'error') showRuntimeError(data.message, data.stack);
    if (data.type === 'ready') meta.textContent = `${state.file.name} · ${Math.round(state.file.size / 1024)} KB · Playwright HTML report · runtime mounted`;
    if (data.type === 'empty') showRuntimeError(data.message);
  }

  window.addEventListener('message', onRuntimeMessage);

  function show(mode) {
    if (!state) return;
    state.mode = mode;
    renderedTab.textContent = 'Rendered';
    sourceTab.textContent = 'Source';
    renderedTab.classList.toggle('active', mode === 'rendered');
    sourceTab.classList.toggle('active', mode === 'source');
    if (mode === 'rendered') body.replaceChildren(renderedView(state.source, state.file));
    else {
      revokeBlobUrl();
      body.replaceChildren(sourceView(state.source));
    }
  }

  window.openArtifactFilePreviewEncoded = async function (encodedFile) {
    let file;
    try {
      file = JSON.parse(decodeURIComponent(encodedFile));
    } catch {
      return previousOpen(encodedFile);
    }

    if (!isHtml(file) || Number(file.size || 0) > MAX_BYTES || !window.S?.artifact) return previousOpen(encodedFile);

    try {
      const response = await fetch(artifactFileUrl(S.artifact.id, file.name), { headers: { Accept: 'text/plain,*/*;q=0.1' } });
      if (!response.ok) return previousOpen(encodedFile);
      const source = await response.text();
      if (!isPlaywrightReport(source)) return previousOpen(encodedFile);

      state = { file, source, mode: 'rendered' };
      title.textContent = file.name.split('/').pop() || file.name;
      meta.textContent = `${file.name} · ${Math.round(file.size / 1024)} KB · Playwright HTML report · starting isolated runtime`;
      download.href = artifactFileUrl(S.artifact.id, file.name, true);
      tabs.classList.remove('hidden');
      modal.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
      show('rendered');
    } catch {
      return previousOpen(encodedFile);
    }
  };

  window.closeArtifactFilePreview = function () {
    state = null;
    revokeBlobUrl();
    renderedTab.textContent = 'Rendered';
    sourceTab.textContent = 'Source';
    return previousClose();
  };

  renderedTab?.addEventListener('click', () => { if (state) show('rendered'); });
  sourceTab?.addEventListener('click', () => { if (state) show('source'); });
  close?.addEventListener('click', () => { state = null; revokeBlobUrl(); });
})();
