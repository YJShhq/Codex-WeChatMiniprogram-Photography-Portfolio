const { works } = require("../../data/works");

Page({
  data: { work: {}, images: [], current: 0, loading: true, stageHeight: 560, slideHeights: [], shareId: "" },
  normalize(work) {
    const fallback = work.src || work.largeURL || work.thumbnailURL || work.largeFileID || work.thumbnailFileID;
    const images = Array.isArray(work.imageURLs) && work.imageURLs.length ? work.imageURLs : Array.isArray(work.imageFileIDs) && work.imageFileIDs.length ? work.imageFileIDs : [fallback].filter(Boolean);
    return { work: { ...work, src: fallback }, images, current: 0, loading: false };
  },
  async setAlbum(work) {
    const album = this.normalize(work);
    this.setData(album);
    await this.measureImages(album.images);
  },
  async measureImages(images) {
    const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const width = windowInfo.windowWidth;
    const fallbackHeight = Math.round(width * 1.35);
    const heights = await Promise.all(images.map((src) => new Promise((resolve) => {
      wx.getImageInfo({
        src,
        success: (info) => {
          const ratio = info.height / info.width;
          resolve(Math.round(width * ratio));
        },
        fail: () => resolve(fallbackHeight)
      });
    })));
    this.setData({ slideHeights: heights, stageHeight: heights[0] || fallbackHeight });
  },
  async onLoad(query) {
    this.setData({ shareId: query.id || "" });
    if (/^\d+$/.test(query.id || "")) {
      await this.setAlbum(works[Number(query.id) || 0]);
      return;
    }
    try {
      const response = await wx.cloud.callFunction({ name: "portfolio", data: { action: "get", id: query.id } });
      if (!response.result || response.result.error) throw new Error(response.result && response.result.error);
      await this.setAlbum(response.result.item);
    } catch (_) {
      this.setData({ loading: false });
      wx.showToast({ title: "作品加载失败", icon: "none" });
    }
  },
  changeSlide(e) {
    const current = e.detail.current;
    this.setData({ current, stageHeight: this.data.slideHeights[current] || this.data.stageHeight });
  },
  preview() { wx.previewImage({ current: this.data.images[this.data.current], urls: this.data.images }); },
  contact() { wx.reLaunch({ url: "/pages/index/index?tab=contact" }); },
  onShareAppMessage() {
    const work = this.data.work || {};
    return {
      title: work.title || `${work.category || "摄影"}作品集`,
      path: `/pages/detail/detail?id=${encodeURIComponent(this.data.shareId)}`,
      imageUrl: work.thumbnailURL || work.largeURL || work.src || ""
    };
  }
});
