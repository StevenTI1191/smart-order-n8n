"""Membangkitkan file workflow n8n (siap import) dari code-nodes/*.js dan sql/queries.sql.

Jalankan dari root project:  python3 scripts/build_workflows.py
Hasil: workflows/01-order-intake.json, 02-order-approval.json (opsional, tombol Telegram),
       03-laporan-harian.json, 04-order-api.json (untuk website)

Dengan cara ini isi Code node dan query di workflow selalu sama dengan file yang diuji
oleh test/test-code-nodes.js. Ubah kodenya di code-nodes/ atau sql/, lalu jalankan ulang skrip ini.
"""

import json
import re
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Nilai yang harus diganti setelah import (dicari di README bagian "Setelah import")
ACCOUNT_ID = "GANTI_ACCOUNT_ID"
CHAT_ID = "GANTI_CHAT_ID"
CF_MODEL = "@cf/google/gemma-4-26b-a4b-it"
ADMIN_URL = "https://order.sldev.my.id/api/admin/login"  # login admin website lalu ke /admin (link di Telegram)

CRED = {
    "webhook": {"httpHeaderAuth": {"id": "webhook-secret", "name": "Webhook Secret"}},
    "cfai": {"httpHeaderAuth": {"id": "cloudflare-ai", "name": "Cloudflare AI"}},
    "pg": {"postgres": {"id": "orders-db", "name": "Orders DB"}},
    "tg": {"telegramApi": {"id": "order-bot", "name": "Order Bot"}},
}


def code(name):
    return (ROOT / "code-nodes" / name).read_text(encoding="utf-8")


def queries():
    text = (ROOT / "sql" / "queries.sql").read_text(encoding="utf-8")
    parts = re.split(r"-- =+\n-- (Q\d)\.", text)[1:]
    out = {}
    for key, body in zip(parts[0::2], parts[1::2]):
        lines = body.split("\n")[1:]  # buang sisa baris judul
        sql = "\n".join(line for line in lines if not line.lstrip().startswith("--")).strip()
        out[key] = sql
    return out


Q = queries()


def uid():
    return str(uuid.uuid4())


def node(name, ntype, version, pos, params, **extra):
    n = {
        "parameters": params,
        "id": uid(),
        "name": name,
        "type": ntype,
        "typeVersion": version,
        "position": pos,
    }
    n.update(extra)
    return n


def code_node(name, file, pos):
    return node(name, "n8n-nodes-base.code", 2, pos, {"jsCode": code(file)})


def if_node(name, pos, conditions, combinator="and"):
    conds = []
    for left, op_type, op, right in conditions:
        operator = {"type": op_type, "operation": op}
        if op in ("true", "false", "notEmpty", "empty"):
            operator["singleValue"] = True
        conds.append({"id": uid(), "leftValue": left, "rightValue": right, "operator": operator})
    return node(name, "n8n-nodes-base.if", 2, pos, {
        "conditions": {
            "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict"},
            "conditions": conds,
            "combinator": combinator,
        },
        "options": {},
    })


def pg_node(name, query, params_expr, pos, always=False):
    p = {"operation": "executeQuery", "query": query, "options": {}}
    if params_expr:
        p["options"]["queryReplacement"] = params_expr
    extra = {"credentials": CRED["pg"]}
    if always:
        extra["alwaysOutputData"] = True
    return node(name, "n8n-nodes-base.postgres", 2.5, pos, p, **extra)


def respond_node(name, body_expr, code_, pos):
    return node(name, "n8n-nodes-base.respondToWebhook", 1.1, pos, {
        "respondWith": "json",
        "responseBody": body_expr,
        "options": {"responseCode": code_},
    })


def tg_send(name, chat, text, pos, extra_fields=None, keyboard=None):
    p = {"chatId": chat, "text": text, "additionalFields": {"appendAttribution": False, **(extra_fields or {})}}
    if keyboard:
        p["replyMarkup"] = "inlineKeyboard"
        p["inlineKeyboard"] = {"rows": [{"row": {"buttons": [
            {"text": t, "additionalFields": {"callback_data": d}} for t, d in keyboard
        ]}}]}
    return node(name, "n8n-nodes-base.telegram", 1.2, pos, p, credentials=CRED["tg"])


def link(conns, src, dst, out=0):
    outputs = conns.setdefault(src, {"main": []})["main"]
    while len(outputs) <= out:
        outputs.append([])
    outputs[out].append({"node": dst, "type": "main", "index": 0})


def workflow(name, nodes, edges):
    names = {n["name"] for n in nodes}
    conns = {}
    for e in edges:
        src, dst, out = (e + (0,))[:3]
        assert src in names and dst in names, f"koneksi ke node yang tidak ada: {e}"
        link(conns, src, dst, out)
    return {
        "name": name,
        "nodes": nodes,
        "connections": conns,
        "active": False,
        "settings": {"executionOrder": "v1"},
        "pinData": {},
        "meta": {"templateCredsSetupCompleted": False},
        "tags": [],
    }


# ---------------------------------------------------------------- Workflow 1
N = "$('Normalisasi').first().json"
intake_nodes = [
    node("Webhook Order", "n8n-nodes-base.webhook", 2, [0, 300], {
        "httpMethod": "POST",
        "path": "order",
        "authentication": "headerAuth",
        "responseMode": "responseNode",
        "options": {},
    }, webhookId=uid(), credentials=CRED["webhook"]),
    code_node("Normalisasi", "01-normalisasi.js", [220, 300]),
    if_node("Valid?", [440, 300], [("={{ $json.valid }}", "boolean", "true", "")]),
    pg_node("Catat Invalid", Q["Q3"],
            "={{ [$json.order_id || '-', $json.source, 'INVALID', $json.errors.join('; ')] }}",
            [660, 520], always=True),
    respond_node("Balas Invalid",
                 f"={{{{ JSON.stringify({{ ok: false, errors: {N}.errors }}) }}}}", 422, [880, 520]),
    pg_node("Cek Riwayat", Q["Q1"],
            "={{ [$json.source, $json.order_id, $json.phone, $json.total] }}", [660, 300]),
    if_node("Duplikat?", [880, 300], [("={{ Number($json.exact_dup) }}", "number", "gt", 0)]),
    pg_node("Catat Duplikat", Q["Q3"],
            f"={{{{ [{N}.order_id, {N}.source, 'DUPLICATE', 'Webhook terkirim ulang'] }}}}",
            [1100, 120], always=True),
    respond_node("Balas Duplikat",
                 f"={{{{ JSON.stringify({{ ok: true, duplicate: true, order_id: {N}.order_id }}) }}}}",
                 200, [1320, 120]),
    code_node("Skor Risiko", "02-skor-risiko.js", [1100, 400]),
    if_node("Perlu AI?", [1320, 400], [("={{ $json.needs_ai }}", "boolean", "true", "")]),
    code_node("Request AI", "03-request-ai.js", [1540, 300]),
    node("Cloudflare AI", "n8n-nodes-base.httpRequest", 4.2, [1760, 300], {
        "method": "POST",
        "url": f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/run/{CF_MODEL}",
        "authentication": "genericCredentialType",
        "genericAuthType": "httpHeaderAuth",
        "sendBody": True,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify($json.ai_request) }}",
        "options": {"timeout": 90000},
    }, credentials=CRED["cfai"], retryOnFail=True, maxTries=3, waitBetweenTries=3000,
        onError="continueRegularOutput"),
    code_node("Parse AI", "04-parse-ai.js", [1980, 300]),
    code_node("Tentukan Status", "05-tentukan-status.js", [2200, 420]),
    pg_node("Simpan Pesanan", Q["Q2"], "={{ $json.params }}", [2420, 420], always=True),
    respond_node("Balas Webhook",
                 "={{ JSON.stringify($('Tentukan Status').first().json.webhook_response) }}",
                 200, [2640, 420]),
    if_node("Perlu Review?", [2860, 420], [
        ("={{ $('Tentukan Status').first().json.status }}", "string", "equals", "PENDING_REVIEW"),
        ("={{ String($('Simpan Pesanan').first().json.id ?? '') }}", "string", "notEmpty", ""),
    ]),
    # Notifikasi saja: keputusan Approve/Reject dilakukan di halaman admin website
    tg_send("Kirim ke Owner", CHAT_ID,
            "={{ $('Tentukan Status').first().json.telegram_text }}\n\nPutuskan di panel admin: "
            + ADMIN_URL, [3080, 420]),
]
intake = workflow("[Order] Intake", intake_nodes, [
    ("Webhook Order", "Normalisasi"),
    ("Normalisasi", "Valid?"),
    ("Valid?", "Cek Riwayat", 0),
    ("Valid?", "Catat Invalid", 1),
    ("Catat Invalid", "Balas Invalid"),
    ("Cek Riwayat", "Duplikat?"),
    ("Duplikat?", "Catat Duplikat", 0),
    ("Duplikat?", "Skor Risiko", 1),
    ("Catat Duplikat", "Balas Duplikat"),
    ("Skor Risiko", "Perlu AI?"),
    ("Perlu AI?", "Request AI", 0),
    ("Perlu AI?", "Tentukan Status", 1),
    ("Request AI", "Cloudflare AI"),
    ("Cloudflare AI", "Parse AI"),
    ("Parse AI", "Tentukan Status"),
    ("Tentukan Status", "Simpan Pesanan"),
    ("Simpan Pesanan", "Balas Webhook"),
    ("Balas Webhook", "Perlu Review?"),
    ("Perlu Review?", "Kirim ke Owner", 0),
])

# ---------------------------------------------------------------- Workflow 2
B = "$('Baca Tombol').first().json"
approval_nodes = [
    node("Telegram Trigger", "n8n-nodes-base.telegramTrigger", 1.1, [0, 300], {
        "updates": ["callback_query"],
        "additionalFields": {},
    }, webhookId=uid(), credentials=CRED["tg"]),
    code_node("Baca Tombol", "06-baca-tombol.js", [220, 300]),
    node("Jawab Tombol", "n8n-nodes-base.telegram", 1.2, [440, 300], {
        "resource": "callback",
        "operation": "answerQuery",
        "queryId": "={{ $json.callback_id }}",
        "additionalFields": {"text": "={{ $json.berwenang ? 'Diproses' : 'Kamu tidak punya akses' }}"},
    }, credentials=CRED["tg"]),
    if_node("Berwenang?", [660, 300], [(f"={{{{ {B}.berwenang }}}}", "boolean", "true", "")]),
    pg_node("Update Keputusan", Q["Q4"], f"={{{{ {B}.params }}}}", [880, 300], always=True),
    if_node("Sudah Diproses?", [1100, 300], [("={{ String($json.id ?? '') }}", "string", "notEmpty", "")]),
    tg_send("Kabari Owner", f"={{{{ {B}.chat_id }}}}",
            f"={{{{ $json.order_id }}}} → {{{{ $json.status }}}} oleh {{{{ {B}.oleh }}}}",
            [1320, 300], extra_fields={"reply_to_message_id": f"={{{{ {B}.message_id }}}}"}),
]
approval = workflow("[Order] Approval", approval_nodes, [
    ("Telegram Trigger", "Baca Tombol"),
    ("Baca Tombol", "Jawab Tombol"),
    ("Jawab Tombol", "Berwenang?"),
    ("Berwenang?", "Update Keputusan", 0),
    ("Update Keputusan", "Sudah Diproses?"),
    ("Sudah Diproses?", "Kabari Owner", 0),
])

# ---------------------------------------------------------------- Workflow 3
report_nodes = [
    node("Setiap Jam 20.00", "n8n-nodes-base.scheduleTrigger", 1.2, [0, 300], {
        "rule": {"interval": [{"field": "days", "triggerAtHour": 20}]},
    }),
    pg_node("Ringkasan 24 Jam", Q["Q5"], None, [220, 300], always=True),
    code_node("Format Laporan", "07-laporan-harian.js", [440, 300]),
    tg_send("Kirim Laporan", CHAT_ID, "={{ $json.teks }}", [660, 300]),
]
report = workflow("[Order] Laporan Harian", report_nodes, [
    ("Setiap Jam 20.00", "Ringkasan 24 Jam"),
    ("Ringkasan 24 Jam", "Format Laporan"),
    ("Format Laporan", "Kirim Laporan"),
])

# ---------------------------------------------------------------- Workflow 4
# API untuk website. Semua endpoint dikunci Header Auth "Webhook Secret";
# yang memanggilnya hanya server website (Cloudflare Worker), bukan browser.
def api_webhook(name, method, path, pos):
    return node(name, "n8n-nodes-base.webhook", 2, pos, {
        "httpMethod": method,
        "path": path,
        "authentication": "headerAuth",
        "responseMode": "responseNode",
        "options": {},
    }, webhookId=uid(), credentials=CRED["webhook"])


K = "$('Cek Keputusan').first().json"
api_nodes = [
    # GET /webhook/api/orders?status=PENDING_REVIEW
    api_webhook("Daftar", "GET", "api/orders", [0, 100]),
    pg_node("Daftar Order", Q["Q6"],
            "={{ [String($json.query?.status || 'ALL').toUpperCase().replace(/[^A-Z_]/g, '') || 'ALL'] }}",
            [220, 100], always=True),
    respond_node("Balas Daftar",
                 "={{ JSON.stringify({ ok: true, orders: $json.orders || [], activity: $json.activity || [] }) }}",
                 200, [440, 100]),

    # POST /webhook/api/decide  body: { id, decision: APPROVE|REJECT, by }
    api_webhook("Keputusan", "POST", "api/decide", [0, 360]),
    code_node("Cek Keputusan", "08-keputusan-web.js", [220, 360]),
    if_node("Keputusan Valid?", [440, 360], [("={{ $json.valid }}", "boolean", "true", "")]),
    respond_node("Balas Tidak Valid",
                 f"={{{{ JSON.stringify({{ ok: false, error: {K}.error }}) }}}}", 400, [660, 520]),
    pg_node("Update Keputusan", Q["Q4"], f"={{{{ {K}.params }}}}", [660, 300], always=True),
    if_node("Berhasil Diubah?", [880, 300], [("={{ String($json.id ?? '') }}", "string", "notEmpty", "")]),
    respond_node("Balas Berhasil",
                 "={{ JSON.stringify({ ok: true, order: $json }) }}", 200, [1100, 220]),
    respond_node("Balas Konflik",
                 "={{ JSON.stringify({ ok: false, error: 'Order tidak ditemukan atau sudah diputuskan' }) }}",
                 409, [1100, 400]),

    # GET /webhook/api/stats  (tanpa data pribadi)
    api_webhook("Statistik Publik", "GET", "api/stats", [0, 700]),
    pg_node("Statistik", Q["Q7"], None, [220, 700], always=True),
    respond_node("Balas Statistik", "={{ JSON.stringify({ ok: true, stats: $json }) }}", 200, [440, 700]),
]
order_api = workflow("[Order] API", api_nodes, [
    ("Daftar", "Daftar Order"),
    ("Daftar Order", "Balas Daftar"),
    ("Keputusan", "Cek Keputusan"),
    ("Cek Keputusan", "Keputusan Valid?"),
    ("Keputusan Valid?", "Update Keputusan", 0),
    ("Keputusan Valid?", "Balas Tidak Valid", 1),
    ("Update Keputusan", "Berhasil Diubah?"),
    ("Berhasil Diubah?", "Balas Berhasil", 0),
    ("Berhasil Diubah?", "Balas Konflik", 1),
    ("Statistik Publik", "Statistik"),
    ("Statistik", "Balas Statistik"),
])

out = ROOT / "workflows"
out.mkdir(exist_ok=True)
for fname, wf in [("01-order-intake.json", intake), ("02-order-approval.json", approval),
                  ("03-laporan-harian.json", report), ("04-order-api.json", order_api)]:
    (out / fname).write_text(json.dumps(wf, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"ditulis workflows/{fname}: {len(wf['nodes'])} node")
