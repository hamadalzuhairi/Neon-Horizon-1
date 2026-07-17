const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = 3000;

app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Multiplayer Logic
let waitingPlayer = null;

io.on('connection', (socket) => {
    socket.on('find_match', (username) => {
        if (waitingPlayer && waitingPlayer.id !== socket.id) {
            const roomName = `room_${socket.id}_${waitingPlayer.id}`;
            socket.join(roomName);
            waitingPlayer.socket.join(roomName);
            
            const seed = Math.floor(Math.random() * 1000000);
            
            io.to(roomName).emit('match_found', {
                room: roomName,
                seed: seed,
                players: {
                    [waitingPlayer.id]: { id: waitingPlayer.id, username: waitingPlayer.username, role: 'host' },
                    [socket.id]: { id: socket.id, username: username, role: 'client' }
                }
            });
            
            waitingPlayer = null;
        } else {
            waitingPlayer = { id: socket.id, socket: socket, username: username };
            socket.emit('waiting_for_match');
        }
    });

    // Custom Invites
    socket.on('create_invite', (username) => {
        const roomName = `invite_${Math.random().toString(36).substr(2, 6)}`;
        socket.join(roomName);
        socket.data.username = username;
        socket.emit('invite_created', roomName);
    });

    socket.on('join_invite', (data) => {
        const roomName = data.roomName;
        const username = data.username;
        const room = io.sockets.adapter.rooms.get(roomName);
        
        if (room && room.size === 1) {
            const hostSocketId = Array.from(room)[0];
            socket.join(roomName);
            
            const seed = Math.floor(Math.random() * 1000000);
            
            io.to(roomName).emit('match_found', {
                room: roomName,
                seed: seed,
                players: {
                    [hostSocketId]: { id: hostSocketId, role: 'host' }, // In a full app we'd grab host username from socket.data
                    [socket.id]: { id: socket.id, username: username, role: 'client' }
                }
            });
        } else {
            socket.emit('invite_error', 'Room full or not found');
        }
    });

    socket.on('player_update', (data) => {
        socket.to(data.room).emit('opponent_update', { id: socket.id, state: data.state });
    });

    socket.on('player_shoot', (data) => {
        socket.to(data.room).emit('opponent_shoot', { id: socket.id, position: data.position });
    });

    socket.on('player_die', (data) => {
        socket.to(data.room).emit('opponent_die', { id: socket.id });
    });
    
    socket.on('game_over', (data) => {
        socket.to(data.room).emit('opponent_game_over', { id: socket.id, score: data.score });
    });
    
    socket.on('leave_match', (data) => {
        if(data && data.room) socket.leave(data.room);
    });

    socket.on('disconnect', () => {
        if (waitingPlayer && waitingPlayer.id === socket.id) {
            waitingPlayer = null;
        }
    });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on http://0.0.0.0:${PORT}`);
});

