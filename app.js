App({
  onLaunch() {
    if (!wx.cloud) {
      wx.showModal({ title: "版本提示", content: "请升级微信后使用云端作品功能。", showCancel: false });
      return;
    }
    wx.cloud.init({
      env: "cloud1-d3gl5lk95dc8aebc2",
      traceUser: true
    });
  },
  globalData: {
    photographer: "成木汤汤",
    wechat: "Huloubo31",
    cloudEnv: "cloud1-d3gl5lk95dc8aebc2"
  }
});
