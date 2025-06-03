'use client';

import { useEffect, useRef } from 'react';

export default function Home() {
  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

  // Change this from useState to useRef
  const isInitiatorRef = useRef(false);

  useEffect(() => {
    let cleanedUp = false;

    async function initWebRTC() {
      // 1) Choose ws:// vs wss://
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${protocol}://${window.location.host}/api/socket`);
      wsRef.current = ws;

      // 2) Create the PeerConnection
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });
      pcRef.current = pc;

      // 3) ICE candidates → broadcast over WS
      pc.onicecandidate = (e) => {
        if (e.candidate) {
          ws.send(JSON.stringify({ type: 'candidate', candidate: e.candidate }));
        }
      };

      // 4) When remote track arrives, attach to remote <video>
      pc.ontrack = (e) => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = e.streams[0];
        }
      };

      // 5) Get local media and add tracks
      try {
        const localStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = localStream;
        }
        localStream.getTracks().forEach((track) => {
          pc.addTrack(track, localStream);
        });
      } catch (err) {
        console.error('Error accessing media devices:', err);
        return;
      }

      // 6) Signaling logic: broadcast “join” when WS opens
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'join' }));
      };

      ws.onmessage = async (msgEv) => {
        const data = JSON.parse(msgEv.data);
        switch (data.type) {
          case 'join':
            // If we hear “join” from someone else, and we are not yet the initiator,
            // we become the initiator and send the offer.
            if (!isInitiatorRef.current) {
              isInitiatorRef.current = true;
              await doCall(pc, ws);
            }
            break;

          case 'offer':
            if (!isInitiatorRef.current) {
              await pc.setRemoteDescription(new RTCSessionDescription(data));
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              ws.send(JSON.stringify(pc.localDescription));
            }
            break;

          case 'answer':
            if (isInitiatorRef.current) {
              await pc.setRemoteDescription(new RTCSessionDescription(data));
            }
            break;

          case 'candidate':
            if (data.candidate) {
              try {
                await pc.addIceCandidate(data.candidate);
              } catch (e) {
                console.error('Error adding ICE candidate:', e);
              }
            }
            break;

          default:
            console.warn('Unknown message type:', data.type);
        }
      };

      // 7) onnegotiationneeded: only trigger if we are the initiator
      pc.onnegotiationneeded = async () => {
        if (
          isInitiatorRef.current &&
          pc.localDescription?.type !== 'offer'
        ) {
          await doCall(pc, ws);
        }
      };
    }

    initWebRTC();

    return () => {
      if (cleanedUp) return;
      cleanedUp = true;
      wsRef.current?.close();
      pcRef.current?.close();
      if (localVideoRef.current) {
        localVideoRef.current.pause();
        localVideoRef.current.srcObject = null;
      }
      if (remoteVideoRef.current) {
        remoteVideoRef.current.pause();
        remoteVideoRef.current.srcObject = null;
      }
    };
  }, []); // <<── Remove isInitiator from the dependency array

  return (
    <div className="flex flex-col items-center space-y-4">
      <h1 className="text-2xl font-bold">
        WebRTC 2-Way Chat (Next.js + WebSocket)
      </h1>
      <div className="flex gap-4">
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          className="w-1/2 border border-gray-300"
        />
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="w-1/2 border border-gray-300"
        />
      </div>
    </div>
  );
}

async function doCall(
  pc: RTCPeerConnection,
  ws: WebSocket
) {
  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    ws.send(JSON.stringify(pc.localDescription));
  } catch (err) {
    console.error('Error creating or sending offer:', err);
  }
}
