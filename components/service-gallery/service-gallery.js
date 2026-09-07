function categoryOrder(item) {
  return Number.isFinite(item.categorySort) ? item.categorySort : (Number.isFinite(item.sort) ? item.sort : 0);
}

Component({
  properties: {
    works: { type: Array, value: [] },
    categories: { type: Array, value: [] }
  },
  data: { selected: "全部作品", filtered: [] },
  observers: {
    "works, selected": function(works, selected) {
      const list = selected === "全部作品"
        ? (works || [])
        : (works || []).filter((item) => item.category === selected).slice().sort((a, b) => categoryOrder(b) - categoryOrder(a));
      this.setData({ filtered: list });
    }
  },
  methods: {
    selectCategory(e) { this.setData({ selected: e.currentTarget.dataset.name }); },
    open(e) { this.triggerEvent("openwork", { id: e.currentTarget.dataset.id }); }
  }
});
