// 作品内容统一维护在这里。新增照片时：
// 1. 把压缩后的图片放进 /images；2. 复制一条记录并修改内容。
const works = [
  {
    id: 0,
    src: "/images/wedding-01.jpg",
    category: "领证",
    title: "领证日 · 树影之间",
    subtitle: "REGISTRATION DAY",
    note: "把属于两个人的普通一天，拍成往后会反复翻看的纪念。"
  },
  {
    id: 1,
    src: "/images/wedding-02.jpg",
    category: "婚礼跟拍",
    title: "婚礼日 · 并肩",
    subtitle: "WEDDING STORY",
    note: "不打断情绪，让拥抱、眼泪和笑声自然发生。"
  },
  {
    id: 2,
    src: "/images/cat-01.jpg",
    category: "个人纪实",
    title: "日常里的松弛时刻",
    subtitle: "PERSONAL DOCUMENTARY",
    note: "真实的生活状态，本身就足够动人。"
  },
  {
    id: 3,
    src: "/images/cat-02.jpg",
    category: "少女写真",
    title: "属于你的私人章节",
    subtitle: "GIRL PORTRAIT",
    note: "不复制模板，从你的气质和喜欢出发完成一组照片。"
  }
];

const services = [
  { name: "领证跟拍", en: "REGISTRATION", intro: "轻量陪伴，记录领证当天的紧张、雀跃与亲密。", cover: "/images/wedding-01.jpg" },
  { name: "婚礼跟拍", en: "WEDDING", intro: "关注人和关系，让婚礼现场真实发生的情绪被好好留下。", cover: "/images/wedding-02.jpg" },
  { name: "私人定制少女写真", en: "PORTRAIT", intro: "拒绝流水线模板，和你一起找到最舒服、最像自己的表达。", cover: "/images/cat-02.jpg" },
  { name: "个人纪实", en: "DOCUMENTARY", intro: "记录日常、生日、旅行或人生阶段里值得珍藏的片刻。", cover: "/images/cat-01.jpg" }
];

module.exports = { works, services };
