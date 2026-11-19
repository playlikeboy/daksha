// A tiny script that runs in <head>, before the page paints:
// - it applies a light or dark choice saved by the theme button, so the page
//   never flashes the wrong colours;
// - it adds the "js" class, which lets site.css hide [data-reveal] blocks until
//   they scroll into view. If the page's JavaScript has not started within four
//   seconds, the class comes off again so nothing stays hidden.
// It stores only the word "light" or "dark" in this browser, and nothing else.
const THEME_SCRIPT = `(function(){var d=document.documentElement;try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")d.setAttribute("data-theme",t);}catch(e){}d.classList.add("js");setTimeout(function(){if(!window.__revealReady)d.classList.remove("js");},4000);})();`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />;
}

export { RevealScript } from "./reveal";
