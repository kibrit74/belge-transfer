# QR Video Süre Optimizasyonu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** QR Video süresindeki dört kat tekrar yükünü ve biriken çizim gecikmesini azaltmak.

**Architecture:** Kare planı varsayılan olarak tek tur ve iki kare tutma kullanacak. Oluşturucu, her kareyi kayıt başlangıcından hesaplanan mutlak zaman çizelgesine göre ilerletecek.

**Tech Stack:** JavaScript, Canvas, MediaRecorder, Vitest

## Global Constraints

- `chunkBytes: 700`, `framesPerSecond: 10`, `holdFrames: 2` korunacak.
- Varsayılan `repeatCount: 1` olacak.
- 291,2 KB tahmini süre en fazla 90 saniye olacak.
- Git deposu bulunmadığından commit adımı uygulanmayacak.

---

### Task 1: Hızlı Varsayılan Kare Planı

**Files:**
- Modify: `src/video/frame-schedule.js`
- Test: `src/__tests__/frame-schedule.test.js`

- [ ] 291,2 KB süre sınırı için başarısız testi yaz.
- [ ] Testin eski ayarla 171 saniye nedeniyle kırıldığını doğrula.
- [ ] Varsayılan tekrarı 1 yap ve testi yeşile çevir.

### Task 2: Birikmeyen Kayıt Zamanlaması

**Files:**
- Modify: `src/video/create-qr-video.js`
- Test: `src/__tests__/create-qr-video.test.js`

- [ ] Geciken QR çiziminin kayıt süresine eklenmesini yakalayan başarısız testi yaz.
- [ ] Zamanlayıcıyı mutlak hedef zamana bağla.
- [ ] Odaklı oluşturma testlerini yeşile çevir.

### Task 3: Doğrulama

- [ ] QR Video ve arayüz odaklı testleri çalıştır.
- [ ] Tam test paketini, lint ve üretim derlemesini çalıştır.
