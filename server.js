const WebSocket = require('ws');
const express = require('express');
const http = require('http');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
app.use(cors());
app.use(express.json());

const clients = new Map();

app.get('/', (req, res) => res.json({ status: 'running', clients: clients.size }));
app.get('/ping', (req, res) => res.json({ status: 'awake', time: Date.now() }));

app.post('/send', (req, res) => {
    const { target, cmd, args } = req.body;
    const client = clients.get(target);
    if (client && client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ cmd, args }));
        res.json({ success: true });
    } else res.json({ success: false });
});

wss.on('connection', ws => {
    ws.on('message', data => {
        try {
            const msg = JSON.parse(data);
            if (msg.type === 'register') {
                clients.set(msg.id, ws);
                ws.send(JSON.stringify({ type: 'registered', id: msg.id }));
            } else if (msg.type === 'control') {
                const target = clients.get(msg.target);
                if (target && target.readyState === WebSocket.OPEN) {
                    target.send(JSON.stringify({ cmd: msg.cmd, args: msg.args }));
                }
            }
        } catch (e) {}
    });

    ws.on('close', () => {
        for (let [id, client] of clients.entries()) {
            if (client === ws) { clients.delete(id); break; }
        }
    });
});

setInterval(() => {
    for (let [id, client] of clients.entries()) {
        if (client.readyState !== WebSocket.OPEN) clients.delete(id);
    }
}, 30000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on ${PORT}`));
