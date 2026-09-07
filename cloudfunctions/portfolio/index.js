const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const works = db.collection("works");
const heroSettings = works.doc("site-home-settings");
const STORAGE_BATCH_SIZE = 50;
const DISPLAY_SECTIONS = ["service", "works"];

function normalizeCategory(category) {
  const aliases = {
    "领证跟拍": "领证",
    "婚礼主机位": "婚礼跟拍",
    "婚礼副机位": "婚礼跟拍",
    "私人定制少女写真": "少女写真"
  };
  return aliases[category] || category;
}

function chunk(items, size = STORAGE_BATCH_SIZE) {
  const batches = [];
  for (let index = 0; index < items.length; index += size) batches.push(items.slice(index, index + size));
  return batches;
}

async function getTempFileURLs(fileIDs = []) {
  const ids = [...new Set(fileIDs.filter((id) => typeof id === "string" && id))];
  const fileList = [];
  for (const batch of chunk(ids)) {
    const result = await cloud.getTempFileURL({ fileList: batch });
    fileList.push(...(result.fileList || []));
  }
  return fileList;
}

async function deleteFiles(fileIDs = []) {
  const ids = [...new Set(fileIDs.filter((id) => typeof id === "string" && id))];
  for (const batch of chunk(ids)) await cloud.deleteFile({ fileList: batch });
}

async function heroPayload(fileIDs = []) {
  const ids = fileIDs.filter((id) => typeof id === "string").slice(0, 12);
  if (!ids.length) return { fileIDs: [], urls: [] };
  const urlMap = {};
  (await getTempFileURLs(ids)).forEach((file) => { if (file.tempFileURL) urlMap[file.fileID] = file.tempFileURL; });
  return { fileIDs: ids, urls: ids.map((id) => urlMap[id] || id) };
}

async function attachDisplayURLs(records) {
  const fileIDs = [...new Set(records.flatMap((item) => [item.thumbnailFileID, item.largeFileID, ...(item.imageFileIDs || [])]).filter(Boolean))];
  if (!fileIDs.length) return records;
  const urlMap = {};
  (await getTempFileURLs(fileIDs)).forEach((file) => { if (file.tempFileURL) urlMap[file.fileID] = file.tempFileURL; });
  return records.map((item) => ({
    ...item,
    category: normalizeCategory(item.category),
    thumbnailURL: urlMap[item.thumbnailFileID] || "",
    largeURL: urlMap[item.largeFileID] || "",
    imageURLs: (item.imageFileIDs || []).map((id) => urlMap[id]).filter(Boolean)
  }));
}

async function isAdmin(openid) {
  try { const result = await db.collection("admins").where({ openid }).limit(1).get(); return result.data.length > 0; }
  catch (_) { return false; }
}

function cleanWork(input = {}) {
  const output = {};
  ["title", "category", "subtitle", "note", "thumbnailFileID", "largeFileID"].forEach((key) => {
    if (typeof input[key] === "string") output[key] = input[key].slice(0, key.includes("FileID") ? 500 : 200);
  });
  output.imageFileIDs = Array.isArray(input.imageFileIDs) ? input.imageFileIDs.filter((id) => typeof id === "string").slice(0, 30) : [];
  const displaySections = Array.isArray(input.displaySections)
    ? [...new Set(input.displaySections.filter((section) => DISPLAY_SECTIONS.includes(section)))]
    : DISPLAY_SECTIONS.slice();
  output.displaySections = displaySections.length ? displaySections : DISPLAY_SECTIONS.slice();
  if (!output.imageFileIDs.length && output.largeFileID) output.imageFileIDs = [output.largeFileID];
  output.published = input.published !== false;
  output.sort = Number.isFinite(input.sort) ? input.sort : Date.now();
  output.categorySort = Number.isFinite(input.categorySort) ? input.categorySort : output.sort;
  return output;
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const action = event.action || "list";
  if (action === "identity") return { openid: OPENID, isAdmin: await isAdmin(OPENID), apiVersion: 8 };
  if (action === "getHero") {
    try {
      const result = await heroSettings.get();
      return await heroPayload(result.data.heroFileIDs || []);
    } catch (_) { return { fileIDs: [], urls: [] }; }
  }
  if (action === "list") {
    const page = Math.max(0, Number(event.page) || 0);
    const pageSize = Math.min(30, Math.max(1, Number(event.pageSize) || 20));
    const result = await works.where({ published: true }).orderBy("sort", "desc").skip(page * pageSize).limit(pageSize + 1).get();
    return { items: await attachDisplayURLs(result.data.slice(0, pageSize)), hasMore: result.data.length > pageSize };
  }
  if (action === "get") {
    const result = await works.doc(event.id).get();
    if (!result.data.published && !(await isAdmin(OPENID))) return { error: "作品未公开" };
    return { item: (await attachDisplayURLs([result.data]))[0] };
  }
  if (!(await isAdmin(OPENID))) return { error: "当前微信没有作品管理权限" };
  if (action === "adminList") {
    const result = await works.orderBy("sort", "desc").limit(100).get();
    const workRecords = result.data.filter((item) => item.recordType !== "siteSettings");
    return { items: await attachDisplayURLs(workRecords) };
  }
  if (action === "updateHero") {
    try {
      if (!Array.isArray(event.fileIDs)) return { error: "封面图片列表格式不正确" };
      const fileIDs = [...new Set(event.fileIDs.filter((id) => typeof id === "string" && id.length > 0 && id.length <= 500))].slice(0, 12);
      if (!fileIDs.length) return { error: "首页至少需要保留一张封面" };
      let previous = [];
      try { previous = ((await heroSettings.get()).data.heroFileIDs || []); } catch (_) {}
      await heroSettings.set({ data: { recordType: "siteSettings", heroFileIDs: fileIDs, published: false, sort: -1, updatedAt: db.serverDate(), updatedBy: OPENID } });
      const removed = previous.filter((id) => !fileIDs.includes(id));
      if (removed.length) { try { await deleteFiles(removed); } catch (_) {} }
      return { ok: true, ...(await heroPayload(fileIDs)) };
    } catch (error) {
      console.error("updateHero failed", error);
      return { error: `更新首页封面失败：${error.message || error.errMsg || "云端执行异常"}` };
    }
  }
  if (action === "create") {
    const work = cleanWork(event.work);
    if (!work.thumbnailFileID || !work.category || !work.imageFileIDs.length) return { error: "作品图片和分类不能为空" };
    const result = await works.add({ data: { ...work, createdAt: db.serverDate(), updatedAt: db.serverDate(), ownerOpenId: OPENID } });
    return { id: result._id };
  }
  if (action === "update") {
    const allowed = {};
    ["title", "category", "subtitle", "note", "published", "sort"].forEach((key) => {
      if (event.patch && event.patch[key] !== undefined) allowed[key] = event.patch[key];
    });
    if (event.patch && event.patch.displaySections !== undefined) {
      if (!Array.isArray(event.patch.displaySections)) return { error: "展示板块格式不正确" };
      const displaySections = [...new Set(event.patch.displaySections.filter((section) => DISPLAY_SECTIONS.includes(section)))];
      if (!displaySections.length) return { error: "作品至少需要选择一个展示板块" };
      allowed.displaySections = displaySections;
    }
    allowed.updatedAt = db.serverDate();
    await works.doc(event.id).update({ data: allowed });
    return { ok: true };
  }
  if (action === "reorderWorks") {
    try {
      if (typeof event.category !== "string" || !event.category.trim()) return { error: "缺少作品分类" };
      if (!Array.isArray(event.ids)) return { error: "作品排序列表格式不正确" };
      const ids = [...new Set(event.ids.filter((id) => typeof id === "string" && id))].slice(0, 100);
      if (!ids.length) return { error: "当前分类没有可排序的作品" };
      const orderField = event.category === "全部作品" ? "sort" : "categorySort";
      for (let index = 0; index < ids.length; index += 1) {
        await works.doc(ids[index]).update({
          data: { [orderField]: ids.length - index, updatedAt: db.serverDate() }
        });
      }
      return { ok: true, updated: ids.length };
    } catch (error) {
      console.error("reorderWorks failed", { category: event.category, message: error.message, stack: error.stack });
      return { error: `保存作品排序失败：${error.message || error.errMsg || "云端执行异常"}` };
    }
  }
  if (action === "updateImages") {
    try {
      if (typeof event.id !== "string" || !event.id) return { error: "缺少作品集 ID" };
      if (!Array.isArray(event.imageFileIDs)) return { error: "图片列表格式不正确" };
      const imageFileIDs = [...new Set(event.imageFileIDs
        .filter((id) => typeof id === "string" && id.length > 0 && id.length <= 500))].slice(0, 30);
      if (!imageFileIDs.length) return { error: "作品集至少需要保留一张图片" };
      const record = await works.doc(event.id).get();
      if (!record.data) return { error: "没有找到对应的作品集" };
      const currentIDs = [...new Set([...(record.data.imageFileIDs || []), record.data.thumbnailFileID, record.data.largeFileID].filter(Boolean))];
      await works.doc(event.id).update({
        data: {
          imageFileIDs,
          thumbnailFileID: imageFileIDs[0],
          largeFileID: imageFileIDs[0],
          updatedAt: db.serverDate()
        }
      });
      const removedIDs = currentIDs.filter((id) => !imageFileIDs.includes(id));
      let cleanupPending = false;
      if (removedIDs.length) {
        try { await deleteFiles(removedIDs); }
        catch (_) { cleanupPending = true; }
      }
      return { ok: true, removed: removedIDs.length, cleanupPending };
    } catch (error) {
      console.error("updateImages failed", { id: event.id, message: error.message, stack: error.stack });
      return { error: `更新作品图片失败：${error.message || error.errMsg || "云端执行异常"}` };
    }
  }
  if (action === "delete") {
    const record = await works.doc(event.id).get();
    const fileList = [...new Set([...(record.data.imageFileIDs || []), record.data.thumbnailFileID, record.data.largeFileID].filter(Boolean))];
    if (fileList.length) await deleteFiles(fileList);
    await works.doc(event.id).remove();
    return { ok: true };
  }
  return { error: "未知操作" };
};
