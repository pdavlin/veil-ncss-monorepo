export type TokenCategory =
  | 'color'
  | 'fontFamily'
  | 'fontSize'
  | 'lineHeight'
  | 'fontWeight'
  | 'letterSpacing'
  | 'spacing'
  | 'borderRadius'
  | 'boxShadow'
  | 'transition';

export interface CollectedSample {
  category: TokenCategory;
  property: string;
  value: string;
  selectorPath: string;
}

declare global {
  interface Window {
    __collectStyles?: () => CollectedSample[];
  }
}

export function collectStylesScript(): string {
  return `(() => {
    const samples = [];

    const COLOR_PROPS = ['color', 'background-color', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color', 'outline-color', 'fill', 'stroke'];
    const SPACE_PROPS = ['margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'gap', 'row-gap', 'column-gap'];
    const RADIUS_PROPS = ['border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius'];

    function selectorPath(el) {
      const parts = [];
      let node = el;
      let depth = 0;
      while (node && node.nodeType === 1 && depth < 4) {
        let part = node.tagName.toLowerCase();
        if (node.id) {
          part += '#' + node.id;
          parts.unshift(part);
          break;
        }
        const cls = (node.getAttribute('class') || '').trim().split(/\\s+/).filter(Boolean).slice(0, 2);
        if (cls.length) part += '.' + cls.join('.');
        parts.unshift(part);
        node = node.parentElement;
        depth++;
      }
      return parts.join(' > ');
    }

    function isVisible(el) {
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return false;
      return true;
    }

    function isRealColor(value) {
      if (!value) return false;
      if (value === 'transparent' || value === 'rgba(0, 0, 0, 0)' || value === 'currentcolor' || value === 'currentColor') return false;
      return true;
    }

    function pushSample(category, property, value, selPath) {
      if (!value || value === 'normal' || value === 'auto' || value === 'none' || value === '0px') {
        if (category === 'spacing' && value === '0px') return;
        if (category === 'borderRadius' && value === '0px') return;
        if (category === 'boxShadow' && value === 'none') return;
        if (category === 'transition' && value === 'all 0s ease 0s') return;
        if (category === 'letterSpacing' && value === 'normal') return;
        if (category === 'lineHeight' && value === 'normal') return;
        if (category !== 'fontFamily' && category !== 'fontSize' && category !== 'fontWeight' && category !== 'color') return;
      }
      samples.push({ category, property, value, selectorPath: selPath });
    }

    const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_ELEMENT, {
      acceptNode(node) {
        if (node.tagName === 'SCRIPT' || node.tagName === 'STYLE' || node.tagName === 'NOSCRIPT') return NodeFilter.FILTER_REJECT;
        return isVisible(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });

    let node = walker.currentNode;
    let count = 0;
    const MAX = 5000;
    while (node && count < MAX) {
      const cs = getComputedStyle(node);
      const sp = selectorPath(node);

      for (const prop of COLOR_PROPS) {
        const v = cs.getPropertyValue(prop).trim();
        if (isRealColor(v)) pushSample('color', prop, v, sp);
      }

      const ff = cs.getPropertyValue('font-family').trim();
      if (ff) pushSample('fontFamily', 'font-family', ff, sp);

      const fs = cs.getPropertyValue('font-size').trim();
      if (fs) pushSample('fontSize', 'font-size', fs, sp);

      const lh = cs.getPropertyValue('line-height').trim();
      if (lh) pushSample('lineHeight', 'line-height', lh, sp);

      const fw = cs.getPropertyValue('font-weight').trim();
      if (fw) pushSample('fontWeight', 'font-weight', fw, sp);

      const ls = cs.getPropertyValue('letter-spacing').trim();
      if (ls) pushSample('letterSpacing', 'letter-spacing', ls, sp);

      for (const prop of SPACE_PROPS) {
        const v = cs.getPropertyValue(prop).trim();
        if (v && v !== '0px' && v !== 'normal') pushSample('spacing', prop, v, sp);
      }

      for (const prop of RADIUS_PROPS) {
        const v = cs.getPropertyValue(prop).trim();
        if (v && v !== '0px') pushSample('borderRadius', prop, v, sp);
      }

      const shadow = cs.getPropertyValue('box-shadow').trim();
      if (shadow && shadow !== 'none') pushSample('boxShadow', 'box-shadow', shadow, sp);

      const transition = cs.getPropertyValue('transition').trim();
      if (transition && transition !== 'all 0s ease 0s' && transition !== 'none 0s ease 0s') {
        pushSample('transition', 'transition', transition, sp);
      }

      node = walker.nextNode();
      count++;
    }

    return samples;
  })()`;
}
