// Minimal DOM adapter for exercising fetch/render flows without a browser.
function element() {
  return {
    value: '', textContent: '', innerHTML: '', style: {}, dataset: {}, children: [], options: [], selectedOptions: [],
    classList: { add() {}, remove() {}, contains() { return false; } },
    replaceChildren(...children) { this.children = [...children]; this.options = [...children]; this.value = ''; },
    appendChild(child) { this.children.push(child); }, add(child) { this.options.push(child); },
    before() {}, after() {}, setAttribute() {}, addEventListener() {},
    querySelectorAll() { return []; }, focus() {},
  };
}
module.exports = { element };
