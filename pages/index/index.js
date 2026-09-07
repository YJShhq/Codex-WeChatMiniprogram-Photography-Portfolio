const { works, services } = require("../../data/works");

function worksForCategory(items, category) {
  if (category === "全部作品") return items || [];
  const order = (item) => Number.isFinite(item.categorySort) ? item.categorySort : (Number.isFinite(item.sort) ? item.sort : 0);
  return (items || []).filter((item) => item.category === category).slice().sort((a, b) => order(b) - order(a));
}

function belongsToSection(item, section) {
  const sections = Array.isArray(item.displaySections) ? item.displaySections : ["service", "works"];
  return sections.includes(section);
}

Page({
  data: {
    currentTab: "home",
    heroImages: ["/images/wedding-01.jpg", "/images/wedding-02.jpg"],
    heroCurrent: 0,
    works,
    serviceWorks: works,
    guestWorks: works,
    displayedWorks: works,
    worksCategory: "全部作品",
    services,
    serviceCategories: ["全部作品", "领证", "订婚", "婚礼跟拍", "答谢宴", "拍立得", "少女写真", "个人纪实"],
    tabs: [
      { key: "home", icon: "⌂", label: "首页" },
      { key: "service", icon: "◌", label: "服务" },
      { key: "works", icon: "▧", label: "客片" },
      { key: "contact", icon: "♙", label: "联系" }
    ],
    loadingWorks: false,
    hasMore: true,
    page: 0
  },
  onLoad(options = {}) {
    if (options.tab && ["home", "service", "works", "contact"].includes(options.tab)) {
      this.setData({ currentTab: options.tab });
    }
    if (wx.showShareMenu) {
      wx.showShareMenu({
        withShareTicket: true,
        menus: ["shareAppMessage", "shareTimeline"]
      });
    }
    this.loadCloudWorks(true);
    this.loadHero();
  },
  async loadHero() {
    if (!wx.cloud) return;
    try {
      const response = await wx.cloud.callFunction({ name: "portfolio", data: { action: "getHero" } });
      const urls = response.result && response.result.urls;
      if (Array.isArray(urls) && urls.length) this.setData({ heroImages: urls, heroCurrent: 0 });
    } catch (error) {
      console.warn("首页封面读取失败，暂时展示默认图片", error);
    }
  },
  changeHero(e) {
    this.setData({ heroCurrent: Number(e.detail.current) || 0 });
  },
  async loadCloudWorks(reset = false) {
    if (!wx.cloud || this.data.loadingWorks || (!reset && !this.data.hasMore)) return;
    this.setData({ loadingWorks: true });
    const page = reset ? 0 : this.data.page;
    let shouldLoadNext = false;
    try {
      const response = await wx.cloud.callFunction({ name: "portfolio", data: { action: "list", page, pageSize: 30 } });
      const result = response.result || {};
      const categoryAliases = { "领证跟拍": "领证", "婚礼主机位": "婚礼跟拍", "婚礼副机位": "婚礼跟拍", "私人定制少女写真": "少女写真" };
      const cloudWorks = (result.items || []).map((item) => ({ ...item, category: categoryAliases[item.category] || item.category, id: item._id, src: item.thumbnailURL || item.largeURL || item.thumbnailFileID || item.largeFileID }));
      if (cloudWorks.length || page > 0) {
        const nextWorks = reset ? cloudWorks : this.data.works.concat(cloudWorks);
        const serviceWorks = nextWorks.filter((item) => belongsToSection(item, "service"));
        const guestWorks = nextWorks.filter((item) => belongsToSection(item, "works"));
        this.setData({ works: nextWorks, serviceWorks, guestWorks, displayedWorks: worksForCategory(guestWorks, this.data.worksCategory), page: page + 1, hasMore: !!result.hasMore });
        shouldLoadNext = !!result.hasMore;
      }
    } catch (error) {
      console.warn("云端作品读取失败，暂时展示本地示例", error);
    } finally {
      this.setData({ loadingWorks: false }, () => {
        if (shouldLoadNext) this.loadCloudWorks(false);
      });
    }
  },
  onReachBottom() { this.loadCloudWorks(false); },
  switchTab(e) {
    this.setData({ currentTab: e.currentTarget.dataset.key });
    wx.pageScrollTo({ scrollTop: 0, duration: 0 });
  },
  selectWorksCategory(e) {
    const worksCategory = e.currentTarget.dataset.category;
    this.setData({ worksCategory, displayedWorks: worksForCategory(this.data.guestWorks, worksCategory) });
  },
  openWork(e) {
    const id = e.detail && e.detail.id !== undefined ? e.detail.id : e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/detail/detail?id=${id}` });
  },
  copyWechat() {
    wx.setClipboardData({ data: "Huloubo31" });
  },
  previewWechat() {
    wx.showModal({
      title: "预约拍摄",
      content: "微信搜索 Huloubo31，添加时请备注拍摄类型与期望日期。",
      confirmText: "复制微信",
      success: (res) => res.confirm && this.copyWechat()
    });
  },
  openAdmin() { wx.navigateTo({ url: "/pages/admin/admin" }); },
  shareContent() {
    const tab = this.data.currentTab || "home";
    const titles = {
      home: "成木汤汤摄影｜记录独一无二的你",
      service: "成木汤汤摄影｜拍摄服务",
      works: "成木汤汤摄影｜客片故事",
      contact: "成木汤汤摄影｜预约与联系"
    };
    const firstWork = (this.data.works || []).find((item) => item && /^https?:\/\//.test(item.src || ""));
    const imageUrl = (this.data.heroImages || []).find((src) => /^https?:\/\//.test(src || "")) || (firstWork && firstWork.src) || "/images/cat-01.jpg";
    return { tab, title: titles[tab] || titles.home, imageUrl };
  },
  onShareAppMessage() {
    const share = this.shareContent();
    return {
      title: share.title,
      path: `/pages/index/index?tab=${share.tab}`,
      imageUrl: share.imageUrl
    };
  },
  onShareTimeline() {
    const share = this.shareContent();
    return {
      title: share.title,
      query: `tab=${share.tab}`,
      imageUrl: share.imageUrl
    };
  }
});
