# QR codes — Jetti Walking Poles

These QR codes encode **https://www.cruisethecreek.com/poles**, which redirects
(via `/poles.html` at the repo root) to the Jetti Walking Poles Peek booking.

| File | Use |
|------|-----|
| `poles-qr-black.png` | Black on white — best camera contrast. Use on the outdoor stand / stickers. |
| `poles-qr-green.png` | Brand forest green on white. |
| `poles-qr.svg` | Vector — scales to any size for large prints/signage without blur. |

- Error-correction level **H** (readable with ~30% wear) — good for outdoor use.
- **Updating the destination:** never reprint the QR. Change the Peek URL in
  `/poles.html` (three spots) and redeploy, or set a Cloudflare Redirect Rule.
  The QR always points at `/poles`.
