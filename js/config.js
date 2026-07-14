/* Kaboom (GitHub Pages 版) — PeerJS 連線設定
 * 預設使用 PeerJS 官方免費雲端訊號伺服器（0.peerjs.com）。
 * 若要改用自架的 peerjs-server，在瀏覽器 Console 執行（主持人與玩家都要設）：
 *   localStorage.setItem('kaboom.peer', JSON.stringify({host:'your.server', port:9000, path:'/', secure:true}))
 * 清除設定：localStorage.removeItem('kaboom.peer')
 */
window.KaboomPeerConfig = () => {
  try {
    const cfg = JSON.parse(localStorage.getItem('kaboom.peer'));
    if (cfg && typeof cfg === 'object') return cfg;
  } catch { /* use default */ }
  return {};
};
