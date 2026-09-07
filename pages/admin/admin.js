const categories = ["领证", "订婚", "婚礼跟拍", "答谢宴", "拍立得", "少女写真", "个人纪实"];
const sortCategories = ["全部作品", ...categories];
const sectionOptions = ["客片板块", "服务板块", "服务和客片"];

function categoryOrder(item) {
  return Number.isFinite(item.categorySort) ? item.categorySort : (Number.isFinite(item.sort) ? item.sort : 0);
}

function normalizeCategory(category) {
  const aliases = { "领证跟拍": "领证", "婚礼主机位": "婚礼跟拍", "婚礼副机位": "婚礼跟拍", "私人定制少女写真": "少女写真" };
  return aliases[category] || category;
}

function displaySectionsForIndex(index) {
  if (Number(index) === 1) return ["service"];
  if (Number(index) === 2) return ["service", "works"];
  return ["works"];
}

function normalizeDisplaySections(item) {
  const sections = Array.isArray(item.displaySections) ? item.displaySections.filter((section) => ["service", "works"].includes(section)) : ["service", "works"];
  return sections.length ? [...new Set(sections)] : ["service", "works"];
}

function sectionIndexFor(item) {
  const sections = normalizeDisplaySections(item);
  if (sections.includes("service") && sections.includes("works")) return 2;
  return sections.includes("service") ? 1 : 0;
}

function sectionLabelFor(item) {
  return sectionOptions[sectionIndexFor(item)];
}

Page({
  data: { checking: true, isAdmin: false, openid: "", categories, sortCategories, sectionOptions, categoryIndex: 0, sectionIndex: 0, title: "", note: "", selected: [], uploading: false, progress: "", works: [], sortCategoryIndex: 0, sortWorks: [], sortDirty: false, sortSaving: false, draggingWorkIndex: -1, dragWorkTargetIndex: -1, dragWorkY: 0, dragWorkTitle: "", editingId: "", editImages: [], editSaving: false, editProgress: "", editOrderDirty: false, draggingIndex: -1, dragTargetIndex: -1, dragX: 0, dragY: 0, dragImageUrl: "", editCategoryIndex: 0, editSectionIndex: 2, editTitle: "", editSubtitle: "", editNote: "", heroImages: [], heroSaving: false, heroProgress: "" },
  onLoad() { this.checkAdmin(); },
  async call(action, data = {}) {
    try {
      const response = await wx.cloud.callFunction({ name: "portfolio", data: { action, ...data } });
      if (!response.result) throw new Error("云函数没有返回结果，请检查 portfolio 云函数是否部署成功");
      if (response.result.error) {
        const message = response.result.error === "未知操作" && ["updateImages", "reorderWorks"].includes(action)
          ? "云端仍是旧版本，请重新上传并部署 portfolio 云函数（选择云端安装依赖）"
          : response.result.error;
        throw new Error(message);
      }
      return response.result;
    } catch (error) {
      if (error.message && !/unknown error/i.test(error.message)) throw error;
      const detail = error.errMsg || error.message || "云端请求失败";
      throw new Error(`云函数调用失败：${detail}`);
    }
  },
  async checkAdmin() {
    try {
      const result = await this.call("identity");
      this.setData({ checking: false, isAdmin: !!result.isAdmin, openid: result.openid });
      if (result.isAdmin) {
        this.loadWorks();
        this.loadHero();
        if (Number(result.apiVersion) !== 8) {
          wx.showModal({ title: "云函数需要更新", content: "当前 portfolio 云函数仍是旧版本。请在开发者工具中重新上传并部署，选择“云端安装依赖”。", showCancel: false });
        }
      }
    } catch (_) {
      this.setData({ checking: false });
      wx.showModal({ title: "云函数未部署", content: "请先上传并部署 portfolio 云函数。", showCancel: false });
    }
  },
  copyOpenId() { wx.setClipboardData({ data: this.data.openid }); },
  chooseCategory(e) { this.setData({ categoryIndex: Number(e.detail.value) }); },
  chooseSection(e) { this.setData({ sectionIndex: Number(e.detail.value) }); },
  inputTitle(e) { this.setData({ title: e.detail.value }); },
  inputNote(e) { this.setData({ note: e.detail.value }); },
  async chooseImages() {
    const remaining = 30 - this.data.selected.length;
    if (remaining <= 0) return wx.showToast({ title: "单个作品最多 30 张", icon: "none" });
    const result = await wx.chooseMedia({ count: Math.min(9, remaining), mediaType: ["image"], sourceType: ["album", "camera"], sizeType: ["original"] });
    const added = result.tempFiles.map((item) => ({ path: item.tempFilePath, size: item.size }));
    this.setData({ selected: this.data.selected.concat(added).slice(0, 30) });
  },
  removeSelected(e) {
    const selected = this.data.selected.slice();
    selected.splice(Number(e.currentTarget.dataset.index), 1);
    this.setData({ selected });
  },
  async compress(path) {
    try { const result = await wx.compressImage({ src: path, quality: 72 }); return result.tempFilePath; }
    catch (_) { return path; }
  },
  async loadHero() {
    try {
      const result = await this.call("getHero");
      this.setData({ heroImages: (result.fileIDs || []).map((fileID, index) => ({ fileID, url: (result.urls || [])[index] || fileID })) });
    } catch (_) {}
  },
  async addHeroImages() {
    const remaining = 12 - this.data.heroImages.length;
    if (remaining <= 0) return wx.showToast({ title: "首页封面最多 12 张", icon: "none" });
    const uploadedIDs = [];
    let updateRequested = false;
    try {
      const result = await wx.chooseMedia({ count: Math.min(9, remaining), mediaType: ["image"], sourceType: ["album", "camera"], sizeType: ["original"] });
      if (!result.tempFiles.length) return;
      this.setData({ heroSaving: true });
      for (let index = 0; index < result.tempFiles.length; index += 1) {
        this.setData({ heroProgress: `正在上传封面 ${index + 1}/${result.tempFiles.length}` });
        const tempPath = await this.compress(result.tempFiles[index].tempFilePath);
        const cloudPath = `hero/${Date.now()}-${index}-${Math.random().toString(36).slice(2)}.jpg`;
        const uploaded = await wx.cloud.uploadFile({ cloudPath, filePath: tempPath });
        uploadedIDs.push(uploaded.fileID);
      }
      this.setData({ heroProgress: "正在保存首页封面" });
      const fileIDs = this.data.heroImages.map((item) => item.fileID).concat(uploadedIDs);
      updateRequested = true;
      await this.call("updateHero", { fileIDs });
      await this.loadHero();
      wx.showToast({ title: "首页封面已更新" });
    } catch (error) {
      if (uploadedIDs.length && !updateRequested) wx.cloud.deleteFile({ fileList: uploadedIDs }).catch(() => {});
      if (!/cancel/i.test(error.errMsg || "")) wx.showModal({ title: "封面上传失败", content: error.message || error.errMsg || "请检查网络后重试。", showCancel: false });
    } finally {
      this.setData({ heroSaving: false, heroProgress: "" });
    }
  },
  async removeHeroImage(e) {
    if (this.data.heroSaving) return;
    if (this.data.heroImages.length <= 1) return wx.showToast({ title: "首页至少保留一张封面", icon: "none" });
    const index = Number(e.currentTarget.dataset.index);
    const confirm = await wx.showModal({ title: "删除首页封面", content: "确定永久删除这张封面图片吗？" });
    if (!confirm.confirm) return;
    try {
      this.setData({ heroSaving: true, heroProgress: "正在删除封面" });
      const fileIDs = this.data.heroImages.filter((_, itemIndex) => itemIndex !== index).map((item) => item.fileID);
      await this.call("updateHero", { fileIDs });
      await this.loadHero();
      wx.showToast({ title: "封面已删除" });
    } catch (error) {
      wx.showModal({ title: "删除失败", content: error.message || "请检查网络后重试。", showCancel: false });
    } finally {
      this.setData({ heroSaving: false, heroProgress: "" });
    }
  },
  subtitleFor(category) {
    if (category === "婚礼跟拍") return "WEDDING STORY";
    if (category === "领证") return "REGISTRATION DAY";
    if (category === "订婚") return "ENGAGEMENT STORY";
    if (category === "答谢宴") return "THANK-YOU BANQUET";
    if (category === "拍立得") return "INSTANT FILM";
    if (category === "少女写真") return "GIRL PORTRAIT";
    return "PERSONAL DOCUMENTARY";
  },
  async uploadAll() {
    if (!this.data.selected.length) return wx.showToast({ title: "请先选择照片", icon: "none" });
    this.setData({ uploading: true });
    const category = categories[this.data.categoryIndex];
    const fileIDs = [];
    try {
      for (let index = 0; index < this.data.selected.length; index += 1) {
        this.setData({ progress: `正在上传 ${index + 1}/${this.data.selected.length}` });
        const tempPath = await this.compress(this.data.selected[index].path);
        const cloudPath = `portfolio/${Date.now()}-${index}-${Math.random().toString(36).slice(2)}.jpg`;
        const uploaded = await wx.cloud.uploadFile({ cloudPath, filePath: tempPath });
        fileIDs.push(uploaded.fileID);
      }
      this.setData({ progress: "正在生成作品集" });
      await this.call("create", {
        work: {
          category,
          title: this.data.title || `${category} · 新作品`,
          note: this.data.note || "记录真实、自然且独一无二的你。",
          subtitle: this.subtitleFor(category),
          thumbnailFileID: fileIDs[0],
          largeFileID: fileIDs[0],
          imageFileIDs: fileIDs,
          displaySections: displaySectionsForIndex(this.data.sectionIndex),
          published: true
        }
      });
      wx.showToast({ title: "作品集已发布" });
      this.setData({ selected: [], title: "", note: "", progress: "" });
      this.loadWorks();
    } catch (error) {
      if (fileIDs.length) wx.cloud.deleteFile({ fileList: fileIDs }).catch(() => {});
      wx.showModal({ title: "上传失败", content: error.message || "请检查云存储权限与网络。", showCancel: false });
    } finally { this.setData({ uploading: false }); }
  },
  async loadWorks() {
    try {
      const result = await this.call("adminList");
      const items = (result.items || []).map((item) => ({ ...item, category: normalizeCategory(item.category), sectionLabel: sectionLabelFor(item) }));
      this.setData({ works: items });
      this.refreshSortWorks(items);
      if (this.data.editingId) {
        const current = items.find((item) => item._id === this.data.editingId);
        if (current) this.setEditImages(current);
        else this.closeImageEditor();
      }
    } catch (_) {}
  },
  refreshSortWorks(works = this.data.works) {
    const category = sortCategories[this.data.sortCategoryIndex];
    const sortWorks = (category === "全部作品" ? (works || []) : (works || []).filter((item) => normalizeCategory(item.category) === category))
      .slice()
      .sort((a, b) => category === "全部作品"
        ? (Number.isFinite(b.sort) ? b.sort : 0) - (Number.isFinite(a.sort) ? a.sort : 0)
        : categoryOrder(b) - categoryOrder(a));
    this.setData({ sortWorks, sortDirty: false, draggingWorkIndex: -1, dragWorkTargetIndex: -1, dragWorkTitle: "" });
  },
  chooseSortCategory(e) {
    if (this.data.sortSaving) return;
    this.setData({ sortCategoryIndex: Number(e.detail.value) }, () => this.refreshSortWorks());
  },
  beginWorkDrag(e) {
    if (this.data.sortSaving) return;
    const index = Number(e.currentTarget.dataset.index);
    const point = e.touches && e.touches[0];
    const work = this.data.sortWorks[index];
    if (!Number.isInteger(index) || !point || !work) return;
    this._workDragRects = null;
    this.setData({ draggingWorkIndex: index, dragWorkTargetIndex: index, dragWorkY: point.clientY, dragWorkTitle: work.title || "未命名作品" });
    wx.createSelectorQuery().in(this).selectAll(".sort-work-item").boundingClientRect((rects) => {
      this._workDragRects = Array.isArray(rects) ? rects : [];
    }).exec();
  },
  moveWorkDrag(e) {
    if (this.data.draggingWorkIndex < 0) return;
    const point = e.touches && e.touches[0];
    if (!point) return;
    const rects = this._workDragRects || [];
    let target = this.data.dragWorkTargetIndex;
    let shortest = Infinity;
    rects.forEach((rect, index) => {
      const distance = Math.abs(point.clientY - (rect.top + rect.height / 2));
      if (distance < shortest) {
        shortest = distance;
        target = index;
      }
    });
    this.setData({ dragWorkTargetIndex: target, dragWorkY: point.clientY });
  },
  endWorkDrag() {
    const from = this.data.draggingWorkIndex;
    const target = this.data.dragWorkTargetIndex;
    const sortWorks = this.data.sortWorks.slice();
    const moved = from >= 0 && target >= 0 && from !== target && from < sortWorks.length && target < sortWorks.length;
    if (moved) {
      const [work] = sortWorks.splice(from, 1);
      sortWorks.splice(target, 0, work);
    }
    this._workDragRects = null;
    this.setData({ sortWorks, sortDirty: this.data.sortDirty || moved, draggingWorkIndex: -1, dragWorkTargetIndex: -1, dragWorkTitle: "" });
  },
  cancelWorkDrag() {
    this._workDragRects = null;
    this.setData({ draggingWorkIndex: -1, dragWorkTargetIndex: -1, dragWorkTitle: "" });
  },
  async saveWorksOrder() {
    if (!this.data.sortDirty || this.data.sortSaving) return;
    try {
      this.setData({ sortSaving: true });
      await this.call("reorderWorks", {
        category: sortCategories[this.data.sortCategoryIndex],
        ids: this.data.sortWorks.map((item) => item._id)
      });
      wx.showToast({ title: "作品顺序已保存" });
      await this.loadWorks();
    } catch (error) {
      wx.showModal({ title: "排序保存失败", content: error.message || "请检查网络后重试。", showCancel: false });
    } finally {
      this.setData({ sortSaving: false });
    }
  },
  setEditImages(item) {
    const ids = item.imageFileIDs || [];
    this.setData({
      editImages: ids.map((fileID, index) => ({ fileID, url: (item.imageURLs || [])[index] || fileID, selected: false })),
      editOrderDirty: false,
      draggingIndex: -1,
      dragTargetIndex: -1,
      dragImageUrl: ""
    });
  },
  editImages(e) {
    const item = e.currentTarget.dataset.item;
    if (this.data.editingId === item._id) return this.closeImageEditor();
    this.setData({ editingId: item._id, editProgress: "" });
    this.setEditMetadata(item);
    this.setEditImages(item);
  },
  setEditMetadata(item) {
    const category = normalizeCategory(item.category);
    const categoryIndex = Math.max(0, categories.indexOf(category));
    this.setData({
      editCategoryIndex: categoryIndex,
      editSectionIndex: sectionIndexFor(item),
      editTitle: item.title || "",
      editSubtitle: item.subtitle || "",
      editNote: item.note || ""
    });
  },
  closeImageEditor() {
    if (this.data.editSaving) return;
    this.setData({ editingId: "", editImages: [], editProgress: "", editOrderDirty: false, draggingIndex: -1, dragTargetIndex: -1, dragImageUrl: "", editCategoryIndex: 0, editSectionIndex: 2, editTitle: "", editSubtitle: "", editNote: "" });
  },
  chooseEditCategory(e) { this.setData({ editCategoryIndex: Number(e.detail.value) }); },
  chooseEditSection(e) { this.setData({ editSectionIndex: Number(e.detail.value) }); },
  inputEditTitle(e) { this.setData({ editTitle: e.detail.value }); },
  inputEditSubtitle(e) { this.setData({ editSubtitle: e.detail.value }); },
  inputEditNote(e) { this.setData({ editNote: e.detail.value }); },
  async saveEditedMetadata() {
    if (this.data.editSaving || !this.data.editingId) return;
    const category = categories[this.data.editCategoryIndex];
    const title = this.data.editTitle.trim();
    if (!title) return wx.showToast({ title: "请填写作品标题", icon: "none" });
    try {
      this.setData({ editSaving: true, editProgress: "正在保存作品资料" });
      await this.call("update", {
        id: this.data.editingId,
        patch: {
          category,
          displaySections: displaySectionsForIndex(this.data.editSectionIndex),
          title,
          subtitle: this.data.editSubtitle.trim() || this.subtitleFor(category),
          note: this.data.editNote.trim()
        }
      });
      wx.showToast({ title: "作品资料已更新" });
      await this.loadWorks();
    } catch (error) {
      wx.showModal({ title: "保存失败", content: error.message || "请检查网络后重试。", showCancel: false });
    } finally {
      this.setData({ editSaving: false, editProgress: "" });
    }
  },
  toggleEditImage(e) {
    if (this.data.editSaving) return;
    const index = Number(e.currentTarget.dataset.index);
    const editImages = this.data.editImages.slice();
    editImages[index] = { ...editImages[index], selected: !editImages[index].selected };
    this.setData({ editImages });
  },
  selectAllEditImages() {
    if (this.data.editSaving) return;
    const allSelected = this.data.editImages.every((item) => item.selected);
    this.setData({ editImages: this.data.editImages.map((item) => ({ ...item, selected: !allSelected })) });
  },
  beginImageDrag(e) {
    if (this.data.editSaving) return;
    const index = Number(e.currentTarget.dataset.index);
    const point = e.touches && e.touches[0];
    const image = this.data.editImages[index];
    if (!Number.isInteger(index) || !point || !image) return;
    this._dragRects = null;
    this._lastDragRender = 0;
    this.setData({
      draggingIndex: index,
      dragTargetIndex: index,
      dragX: point.clientX,
      dragY: point.clientY,
      dragImageUrl: image.url || image.fileID
    });
    wx.createSelectorQuery().in(this).selectAll(".editor-image").boundingClientRect((rects) => {
      this._dragRects = Array.isArray(rects) ? rects : [];
    }).exec();
  },
  moveImageDrag(e) {
    if (this.data.draggingIndex < 0) return;
    const point = e.touches && e.touches[0];
    if (!point) return;
    const rects = this._dragRects || [];
    let target = this.data.dragTargetIndex;
    if (rects.length) {
      let shortest = Infinity;
      rects.forEach((rect, index) => {
        const dx = point.clientX - (rect.left + rect.width / 2);
        const dy = point.clientY - (rect.top + rect.height / 2);
        const distance = dx * dx + dy * dy;
        if (distance < shortest) {
          shortest = distance;
          target = index;
        }
      });
    }
    const now = Date.now();
    if (target !== this.data.dragTargetIndex || now - this._lastDragRender >= 32) {
      this._lastDragRender = now;
      this.setData({ dragTargetIndex: target, dragX: point.clientX, dragY: point.clientY });
    }
  },
  endImageDrag() {
    const from = this.data.draggingIndex;
    const target = this.data.dragTargetIndex;
    const editImages = this.data.editImages.slice();
    const moved = from >= 0 && target >= 0 && from !== target && from < editImages.length && target < editImages.length;
    if (moved) {
      const [image] = editImages.splice(from, 1);
      editImages.splice(target, 0, image);
    }
    this._dragRects = null;
    this.setData({
      editImages,
      editOrderDirty: this.data.editOrderDirty || moved,
      draggingIndex: -1,
      dragTargetIndex: -1,
      dragImageUrl: ""
    });
  },
  cancelImageDrag() {
    this._dragRects = null;
    this.setData({ draggingIndex: -1, dragTargetIndex: -1, dragImageUrl: "" });
  },
  saveImageOrder() {
    if (!this.data.editOrderDirty || this.data.editSaving) return;
    return this.saveEditedImages(this.data.editImages.map((item) => item.fileID));
  },
  async chooseEditMedia(count) {
    const result = await wx.chooseMedia({ count: Math.min(9, count), mediaType: ["image"], sourceType: ["album", "camera"], sizeType: ["original"] });
    return result.tempFiles.map((item) => item.tempFilePath);
  },
  async uploadEditFiles(paths, label) {
    const fileIDs = [];
    try {
      for (let index = 0; index < paths.length; index += 1) {
        this.setData({ editProgress: `${label} ${index + 1}/${paths.length}` });
        const tempPath = await this.compress(paths[index]);
        const cloudPath = `portfolio/${Date.now()}-edit-${index}-${Math.random().toString(36).slice(2)}.jpg`;
        const uploaded = await wx.cloud.uploadFile({ cloudPath, filePath: tempPath });
        fileIDs.push(uploaded.fileID);
      }
    } catch (error) {
      if (fileIDs.length) await wx.cloud.deleteFile({ fileList: fileIDs }).catch(() => {});
      throw error;
    }
    return fileIDs;
  },
  async saveEditedImages(imageFileIDs) {
    try {
      this.setData({ editSaving: true, editProgress: "正在保存作品集" });
      await this.call("updateImages", { id: this.data.editingId, imageFileIDs });
      wx.showToast({ title: "图片已更新" });
      await this.loadWorks();
    } catch (error) {
      wx.showModal({ title: "更新失败", content: error.message || "请检查网络后重试。", showCancel: false });
    } finally {
      this.setData({ editSaving: false, editProgress: "" });
    }
  },
  async addEditImages() {
    const remaining = 30 - this.data.editImages.length;
    if (remaining <= 0) return wx.showToast({ title: "单个作品最多 30 张", icon: "none" });
    try {
      const paths = await this.chooseEditMedia(remaining);
      if (!paths.length) return;
      this.setData({ editSaving: true });
      const uploadedIDs = await this.uploadEditFiles(paths, "正在上传");
      const finalIDs = this.data.editImages.map((item) => item.fileID).concat(uploadedIDs);
      await this.saveEditedImages(finalIDs);
    } catch (error) {
      this.setData({ editSaving: false, editProgress: "" });
      if (!/cancel/i.test(error.errMsg || "")) wx.showModal({ title: "上传失败", content: error.message || error.errMsg || "请检查网络后重试。", showCancel: false });
    }
  },
  async replaceEditImage(e) {
    const index = Number(e.currentTarget.dataset.index);
    try {
      const paths = await this.chooseEditMedia(1);
      if (!paths.length) return;
      this.setData({ editSaving: true });
      const uploadedIDs = await this.uploadEditFiles(paths.slice(0, 1), "正在替换");
      const finalIDs = this.data.editImages.map((item) => item.fileID);
      finalIDs[index] = uploadedIDs[0];
      await this.saveEditedImages(finalIDs);
    } catch (error) {
      this.setData({ editSaving: false, editProgress: "" });
      if (!/cancel/i.test(error.errMsg || "")) wx.showModal({ title: "替换失败", content: error.message || error.errMsg || "请检查网络后重试。", showCancel: false });
    }
  },
  async deleteSelectedImages() {
    const selectedCount = this.data.editImages.filter((item) => item.selected).length;
    if (!selectedCount) return wx.showToast({ title: "请先选择图片", icon: "none" });
    if (selectedCount >= this.data.editImages.length) return wx.showToast({ title: "作品集至少保留一张", icon: "none" });
    const result = await wx.showModal({ title: "批量删除图片", content: `确定永久删除选中的 ${selectedCount} 张云端图片吗？` });
    if (!result.confirm) return;
    await this.saveEditedImages(this.data.editImages.filter((item) => !item.selected).map((item) => item.fileID));
  },
  async toggle(e) {
    const item = e.currentTarget.dataset.item;
    await this.call("update", { id: item._id, patch: { published: !item.published } });
    this.loadWorks();
  },
  async remove(e) {
    const item = e.currentTarget.dataset.item;
    const confirm = await wx.showModal({ title: "删除作品集", content: "该作品集中的全部云端照片都会删除，且无法恢复。" });
    if (!confirm.confirm) return;
    await this.call("delete", { id: item._id });
    this.loadWorks();
  },
  onShareAppMessage(options) {
    const item = options.target && options.target.dataset ? options.target.dataset.item : null;
    if (!item || !item._id) return { title: "摄影作品集", path: "/pages/index/index?tab=works" };
    return {
      title: item.title || `${item.category || "摄影"}作品集`,
      path: `/pages/detail/detail?id=${encodeURIComponent(item._id)}`,
      imageUrl: item.thumbnailURL || item.largeURL || item.thumbnailFileID || ""
    };
  }
});
