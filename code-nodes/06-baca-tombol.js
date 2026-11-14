// Node: "Baca Tombol"  (Code node, workflow "Order Approval", mode: Run Once for All Items)
// Input : Telegram Trigger (update: callback_query)
// Callback data dari tombol: "approve:<id>" atau "reject:<id>" (id = kolom orders.id)

const OWNER_IDS = [123456789]; // ganti dengan user id Telegram owner/admin

const cq = $input.first().json.callback_query || {};
const [aksi, id] = String(cq.data || '').split(':');
const status_baru = aksi === 'approve' ? 'APPROVED_MANUAL' : aksi === 'reject' ? 'REJECTED' : null;
const oleh = cq.from?.username ? '@' + cq.from.username : (cq.from?.first_name || 'unknown');

return [{
  json: {
    aksi,
    id,
    status_baru,
    oleh,
    berwenang: OWNER_IDS.includes(cq.from?.id) && Boolean(status_baru) && /^\d+$/.test(id || ''),
    callback_id: cq.id,
    chat_id: cq.message?.chat?.id,
    message_id: cq.message?.message_id,
    params: [status_baru, oleh, id],
  },
}];
