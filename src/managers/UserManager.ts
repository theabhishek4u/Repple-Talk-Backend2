import { Socket } from "socket.io";
import { RoomManager } from "./RoomManager";

export interface User {
  name: string;
  socket: Socket;
}

export class UserManager {
  private users: User[];
  private queue: string[];
  private roomManager: RoomManager;

  constructor() {
    this.users = [];
    this.queue = [];
    this.roomManager = new RoomManager();
  }

  addUser(name: string, socket: Socket) {
    this.users.push({ name, socket });
    this.queue.push(socket.id);

    socket.emit("lobby");

    this.initHandler(socket);
    this.tryPairUsers();
  }

  removeUser(socketId: string) {
    this.users = this.users.filter((u) => u.socket.id !== socketId);
    this.queue = this.queue.filter((id) => id !== socketId);

    const room = this.roomManager.findRoomBySocketId(socketId);

    if (!room) return;

    console.log(`Cleaning up room ${room.id}, user ${socketId} disconnected`);

    const otherUser =
      room.user1.socket.id === socketId ? room.user2 : room.user1;

    this.roomManager.deleteRoomById(room);

    if (otherUser && otherUser.socket) {
      otherUser.socket.emit("user-disconnected");
      this.queue.push(otherUser.socket.id);
    }

    this.tryPairUsers();
  }

  private tryPairUsers() {
    console.log("Queue length:", this.queue.length);

    while (this.queue.length >= 2) {
      const id1 = this.queue.shift();
      const id2 = this.queue.shift();

      if (!id1 || !id2) continue;

      const user1 = this.users.find((u) => u.socket.id === id1);
      const user2 = this.users.find((u) => u.socket.id === id2);

      if (!user1 || !user2) {
        if (user1) this.queue.push(user1.socket.id);
        if (user2) this.queue.push(user2.socket.id);
        continue;
      }

      console.log(`Pairing: ${id1} <-> ${id2}`);
      this.roomManager.createRoom(user1, user2);
    }
  }

  private initHandler(socket: Socket) {
    socket.on("offer", ({ sdp, roomId, senderSocketId }) => {
      this.roomManager.onOffer(roomId, sdp, senderSocketId);
    });

    socket.on("answer", ({ sdp, roomId, senderSocketId }) => {
      this.roomManager.onAnswer(roomId, sdp, senderSocketId);
    });

    socket.on("add-ice-candidate", ({ candidate, roomId }) => {
      this.roomManager.onIceCandidate(roomId, socket.id, candidate);
    });

    socket.on("next-user", ({ roomId }) => {
      console.log("User requested next partner");
      this.handleNextUser(socket.id, roomId);
    });

    socket.on("chat-message", ({ roomId, message, senderSocketId }) => {
      this.roomManager.chatMessage(roomId, senderSocketId, message);
    });

    // ❗ REMOVED duplicate disconnect handler (already in index.ts)
  }

  private handleNextUser(socketId: string, roomId: string) {
    const room = this.roomManager.findRoomBySocketId(socketId);

    if (room) {
      const otherUser =
        room.user1.socket.id === socketId ? room.user2 : room.user1;

      this.roomManager.deleteRoomById(room);

      if (otherUser && otherUser.socket) {
        otherUser.socket.emit("user-disconnected");
        this.queue.push(otherUser.socket.id);
      }
    }

    this.queue.push(socketId);
    this.tryPairUsers();
  }
}
