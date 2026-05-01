html = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Adventures — Cruise the Creek Electric Bikes</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html{scroll-behavior:smooth}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;background:#f5f0ea}
/* NAV */
header{position:sticky;top:0;z-index:200;background:rgba(250,246,241,0.92);backdrop-filter:blur(10px);border-bottom:1px solid #e0d5c8;padding:.75rem 2rem;display:flex;align-items:center;justify-content:space-between;gap:1rem}
.logo{display:flex;align-items:center;gap:.6rem;text-decoration:none}
.logo img{height:38px}
.logo-text{font-size:.75rem;font-weight:700;color:#3d2e1e;line-height:1.2;text-transform:uppercase;letter-spacing:.05em}
nav{display:flex;align-items:center;gap:.25rem;flex-wrap:wrap}
nav a{font-size:.78rem;font-weight:500;color:#4a4040;text-decoration:none;padding:.4rem .7rem;border-radius:4px;transition:background .2s}
nav a:hover,nav a.active{background:#e8ddd0;color:#3d2e1e}
.btn-rent{background:#3a5c3a;color:#fff!important;border-radius:20px;padding:.45rem 1.1rem!important;font-weight:600!important}
.btn-rent:hover{background:#2d4a2d!important}
/* HERO */
.hero{position:relative;min-height:88vh;display:flex;align-items:center;justify-content:center;overflow:hidden;background:#2c3a2c}
.hero-bg{position:absolute;inset:0;background:linear-gradient(160deg,#1a2e1a 0%,#3a5030 50%,#5a6840 100%);opacity:.85}
.hero-img-hint{position:absolute;inset:0;background:url('') center/cover no-repeat;mix-blend-mode:overlay}
.hero-content{position:relative;text-align:center;color:#fff;padding:2rem;max-width:700px}
.hero-tag{font-size:.72rem;letter-spacing:.2em;text-transform:uppercase;color:#c8b89a;margin-bottom:1rem}
.hero h1{font-size:clamp(2.2rem,6vw,4rem);font-weight:800;line-height:1.1;margin-bottom:1rem;text-shadow:0 2px 20px rgba(0,0,0,.4)}
.hero p{font-size:1.05rem;color:#d8cfc4;max-width:480px;margin:0 auto 2rem}
.fleet-badges{display:flex;flex-wrap:wrap;justify-content:center;gap:.5rem;margin-bottom:2rem}
.fleet-badge{background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.3);color:#fff;font-size:.78rem;padding:.35rem .9rem;border-radius:20px;backdrop-filter:blur(4px)}
.fleet-badge.in-stock{background:rgba(60,120,60,.5);border-color:rgba(120,200,120,.4)}
.btn-primary{display:inline-block;background:#fff;color:#3d2e1e;font-weight:700;padding:.85rem 2.2rem;border-radius:30px;text-decoration:none;font-size:.95rem;transition:transform .2s,box-shadow .2s;box-shadow:0 4px 20px rgba(0,0,0,.25)}
.btn-primary:hover{transform:translateY(-2px);box-shadow:0 8px 30px rgba(0,0,0,.3)}
/* EXPERIENCE TOGGLE */
.experience{background:#f0ebe2;padding:4rem 2rem;text-align:center}
.exp-bike-img{width:140px;height:140px;border-radius:50%;background:#c8b89a;margin:0 auto 2rem;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.15)}
.exp-bike-img img{width:100%;height:100%;object-fit:cover}
.exp-toggle{display:inline-flex;border:2px solid #b0a090;border-radius:30px;overflow:hidden;margin-bottom:1.5rem}
.exp-btn{padding:.55rem 1.4rem;font-size:.85rem;font-weight:600;cursor:pointer;border:none;background:transparent;color:#6a5a4a;transition:background .2s,color .2s}
.exp-btn.active{background:#3d2e1e;color:#fff}
.exp-subtext{font-size:.85rem;color:#8a7a6a;margin-bottom:1.5rem}
.btn-avail{display:inline-block;background:#3d2e1e;color:#fff;font-weight:700;padding:.75rem 1.8rem;border-radius:25px;text-decoration:none;font-size:.9rem;margin-right:.75rem}
.btn-switch{display:inline-block;background:#3a5c3a;color:#fff;font-weight:600;padding:.65rem 1.4rem;border-radius:25px;text-decoration:none;font-size:.82rem}
/* 3 STEPS */
.steps-section{background:#c4a882;padding:5rem 2rem}
.steps-inner{max-width:1100px;margin:0 auto;display:grid;grid-template-columns:1fr auto;gap:4rem;align-items:center}
.steps-title{font-size:1rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#3d2e1e;margin-bottom:3rem;text-align:center;grid-column:1}
.steps-list{display:flex;flex-direction:column;gap:2.5rem}
.step{display:flex;align-items:flex-start;gap:1.5rem}
.step-num{font-size:.65rem;color:#7a5a3a;letter-spacing:.1em;display:block;margin-bottom:.2rem}
.step h3{font-size:1.8rem;font-weight:800;color:#1a1a1a;line-height:1}
.step p{font-size:.85rem;color:#5a4a38;margin-top:.3rem}
.step-icon{width:48px;height:48px;border-radius:50%;background:#3d2e1e;display:flex;align-items:center;justify-content:center;color:#c4a882;font-size:1.1rem;flex-shrink:0;margin-top:.2rem}
.steps-photo{width:220px;height:280px;border-radius:12px;background:#8a7060;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,.2)}
.steps-photo img{width:100%;height:100%;object-fit:cover}
/* QUICK LINKS */
.quick-links{background:#c4a882;border-top:1px solid rgba(255,255,255,.3);padding:3rem 2rem}
.quick-links-inner{max-width:700px;margin:0 auto;display:flex;flex-direction:column;gap:1rem}
.quick-link-row{display:flex;align-items:center;justify-content:space-between;padding:.75rem 0;border-bottom:1px solid rgba(255,255,255,.3)}
.quick-link-row:last-child{border-bottom:none}
.ql-dot{width:14px;height:14px;border-radius:50%;background:#7a5a3a;margin-right:1rem;flex-shrink:0}
.ql-label{font-size:.95rem;font-weight:600;color:#1a1a1a;flex:1}
.ql-btn{background:#3d2e1e;color:#fff;font-size:.8rem;font-weight:600;padding:.45rem 1.1rem;border-radius:20px;text-decoration:none;white-space:nowrap;transition:background .2s}
.ql-btn:hover{background:#2a1e10}
/* NATURE BANNER */
.nature-banner{height:380px;background:linear-gradient(135deg,#2c3a1c,#4a5c30,#6a7840);display:flex;align-items:flex-end;padding:2rem}
/* TRAILSIDE SECTION */
.trailside{background:#f5f0ea;padding:3rem 2rem}
.trailside h2{text-align:center;font-size:1.4rem;font-weight:700;margin-bottom:2rem;color:#3d2e1e}
.trail-dark-box{height:120px;background:#3d2e1e;border-radius:8px;margin-bottom:1.5rem}
.trail-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:0;border-radius:10px;overflow:hidden}
.trail-card{height:280px;position:relative;display:flex;align-items:flex-end;padding:1.25rem}
.trail-card:nth-child(1){background:linear-gradient(160deg,#3a5030,#6a7840)}
.trail-card:nth-child(2){background:linear-gradient(160deg,#4a6040,#8a9060)}
.trail-card:nth-child(3){background:linear-gradient(160deg,#2a3820,#4a5830)}
.trail-card-text{color:#fff;font-size:1.15rem;font-weight:800;line-height:1.2;text-shadow:0 2px 8px rgba(0,0,0,.5)}
.trail-card .pill{display:inline-block;margin-top:.6rem;background:#3a5c3a;color:#fff;font-size:.72rem;font-weight:600;padding:.3rem .85rem;border-radius:20px;text-decoration:none}
.trail-card .bubble{width:90px;height:90px;border-radius:50%;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;font-size:.8rem;font-weight:700;color:#fff;text-align:center;margin-bottom:.5rem}
/* FOOTER */
footer{background:#f0ebe2;border-top:1px solid #ddd4c4;padding:3rem 2rem;text-align:center}
.footer-logo{font-weight:800;font-size:1rem;color:#3d2e1e;margin-bottom:.25rem}
.footer-sub{font-size:.8rem;color:#8a7a6a;margin-bottom:1.25rem}
.footer-avail{display:inline-block;background:#3d2e1e;color:#fff;font-weight:700;padding:.7rem 2rem;border-radius:25px;text-decoration:none;margin-bottom:2rem;font-size:.9rem}
.footer-contacts{display:flex;flex-wrap:wrap;justify-content:center;gap:2rem;margin-bottom:1.75rem}
.footer-contact h4{font-size:.75rem;font-weight:700;color:#3d2e1e;text-decoration:underline;margin-bottom:.4rem}
.footer-contact p,.footer-contact a{font-size:.75rem;color:#5a4a38;display:block;line-height:1.6;text-decoration:none}
.footer-links{display:flex;flex-wrap:wrap;justify-content:center;gap:.5rem 1rem;margin-bottom:1.25rem}
.footer-links a{font-size:.75rem;color:#3d2e1e;text-decoration:underline}
.footer-copy{font-size:.72rem;color:#8a7a6a}
/* RESPONSIVE */
@media(max-width:768px){
  header{padding:.6rem 1rem}
  nav a{font-size:.72rem;padding:.35rem .5rem}
  .steps-inner{grid-template-columns:1fr}
  .steps-photo{display:none}
  .trail-cards{grid-template-columns:1fr}
  .trail-card{height:180px}
}
</style>
</head>
<body>

<header>
  <a href="#" class="logo">
    <svg width="36" height="36" viewBox="0 0 36 36"><circle cx="18" cy="18" r="18" fill="#3a5c3a"/><circle cx="18" cy="18" r="10" fill="none" stroke="#fff" stroke-width="2"/><circle cx="18" cy="18" r="3" fill="#fff"/></svg>
    <div class="logo-text">Cruise the Creek<br>Electric Bikes</div>
  </a>
  <nav>
    <a href="#" class="active">Adventures</a>
    <a href="#">Shop</a>
    <a href="#">Service</a>
    <a href="#">Test Rides</a>
    <a href="#">Rent to Own</a>
    <a href="#">Creek Life</a>
    <a href="#" class="btn-rent">Rent An EBike &rsaquo;</a>
  </nav>
</header>

<section class="hero">
  <div class="hero-bg"></div>
  <div class="hero-content">
    <div class="hero-tag">Mill Creek Park &bull; Youngstown, OH</div>
    <h1>#Unleash Your<br>Adventure</h1>
    <p>Adventure Awaits! Rent an electric bike and experience the sights and sounds of the park in a new and exciting way!</p>
    <div class="fleet-badges">
      <span class="fleet-badge"><strong>8 Bikes</strong> in The Fleet</span>
      <span class="fleet-badge in-stock">3 High Step in stock &mdash;</span>
      <span class="fleet-badge in-stock">3 Step-Thru in stock &mdash;</span>
      <span class="fleet-badge in-stock">2 Cargo E-Bikes &mdash;</span>
    </div>
    <a href="#" class="btn-primary">Book Your Adventure</a>
  </div>
</section>

<section class="experience">
  <div class="exp-bike-img"><svg viewBox="0 0 140 140" width="140" height="140"><rect width="140" height="140" fill="#a08060"/><circle cx="70" cy="80" r="35" fill="none" stroke="#fff" stroke-width="6"/><circle cx="70" cy="80" r="8" fill="#fff"/><line x1="70" y1="45" x2="70" y2="72" stroke="#fff" stroke-width="5"/><line x1="55" y1="55" x2="70" y2="72" stroke="#fff" stroke-width="5"/></svg></div>
  <div class="exp-toggle">
    <button class="exp-btn active">#Unleash Your Adventure</button>
    <button class="exp-btn">#Trailside Journey</button>
  </div>
  <div class="exp-subtext">Bears Den Rd, Youngstown &bull; Park &amp; Pickup at Scholl Pavilion</div>
  <div>
    <a href="#" class="btn-avail">Check Availability</a>
    <a href="#trailside" class="btn-switch">Switch to #Trailside Journey &rarr;</a>
  </div>
</section>

<section class="steps-section">
  <div class="steps-inner">
    <div>
      <div class="steps-title">Book Your Trip in 3 Easy Steps</div>
      <div class="steps-list">
        <div class="step">
          <div class="step-icon">&#x1F4C5;</div>
          <div><span class="step-num">01</span><h3>Reserve Your Ride</h3><p>Pick the number of bikes and time slot!</p></div>
        </div>
        <div class="step">
          <div class="step-icon">&#x2709;</div>
          <div><span class="step-num">02</span><h3>Get Started</h3><p>Receive an email with contact details, basic information &amp; waiver forms</p></div>
        </div>
        <div class="step">
          <div class="step-icon">&#x1F6B2;</div>
          <div><span class="step-num">03</span><h3>Cruise The Park</h3><p>Pick up your bikes and start the adventure!</p></div>
        </div>
      </div>
    </div>
    <div class="steps-photo"><svg viewBox="0 0 220 280" width="220" height="280"><rect width="220" height="280" fill="#8a7060"/><text x="110" y="140" text-anchor="middle" fill="rgba(255,255,255,.4)" font-size="13">Cargo Bike</text></svg></div>
  </div>
</section>

<section class="quick-links">
  <div class="quick-links-inner">
    <div class="quick-link-row"><div class="ql-dot"></div><span class="ql-label">Learn More About Us</span><a href="#" class="ql-btn">Learn More</a></div>
    <div class="quick-link-row"><div class="ql-dot"></div><span class="ql-label">Mill Creek Hotspots</span><a href="#" class="ql-btn">Plan Your Cruise</a></div>
    <div class="quick-link-row"><div class="ql-dot"></div><span class="ql-label">Read What They&rsquo;re Saying</span><a href="#" class="ql-btn">Reviews</a></div>
    <div class="quick-link-row"><div class="ql-dot"></div><span class="ql-label">Bike Trails In The Park</span><a href="#" class="ql-btn">Bike Trails</a></div>
    <div class="quick-link-row"><div class="ql-dot"></div><span class="ql-label">Safety And Operations</span><a href="#" class="ql-btn">Learn More</a></div>
  </div>
</section>

<div class="nature-banner"></div>

<section class="trailside" id="trailside">
  <h2>Need Something More Relaxing?</h2>
  <div class="trail-dark-box"></div>
  <div class="trail-cards">
    <div class="trail-card"><div><div class="trail-card-text">Only Electric Bike Service Near the trailhead</div></div></div>
    <div class="trail-card"><div><div class="trail-card-text">Checkout Trailside Journey</div><a href="#" class="pill">Switch to #Trailside Journey &rarr;</a></div></div>
    <div class="trail-card"><div><div class="bubble">11 miles of fun!</div><div class="trail-card-text">Relax and unwind</div></div></div>
  </div>
</section>

<footer>
  <div class="footer-logo">Cruise The Creek</div>
  <div class="footer-sub">Electric Bikes</div>
  <a href="#" class="footer-avail">Check Availability</a>
  <div class="footer-contacts">
    <div class="footer-contact">
      <h4>Info &mdash; Rentals &mdash;Tours &mdash; Sponsorships</h4>
      <p>Text Preferred 330-406-9686</p>
      <a href="mailto:info@cruisethecreek.com">info@cruisethecreek.com</a>
    </div>
    <div class="footer-contact">
      <h4>Sales &mdash; Test Rides &mdash; Repairs</h4>
      <p>Text Preferred 330-406-9682</p>
      <a href="mailto:salesteam@cruisethecreek.com">salesteam@cruisethecreek.com</a>
    </div>
    <div class="footer-contact">
      <h4>#Unleash Your Adventure</h4>
      <p>Bears Den Road</p>
      <p>Youngstown Ohio 44511</p>
      <p>Park &amp; Pickup in front of Scholl Recreational Pavilion</p>
    </div>
    <div class="footer-contact">
      <h4>#Trailside Journey</h4>
      <p>6685 Kirk Road</p>
      <p>Canfield Ohio 44406</p>
      <p>Park at the Bottom of the hill and walk up to the Kirk Road Trailhead</p>
    </div>
  </div>
  <div class="footer-links">
    <a href="#">Cancellation Policy</a>
    <a href="#">Privacy Policy</a>
    <a href="#">Liability Waiver</a>
    <a href="#">Terms of Service</a>
    <a href="#">Frequently Asked Questions</a>
  </div>
  <div class="footer-copy">&copy; 2026 by Cruise The Creek.</div>
</footer>

<script>
document.querySelectorAll('.exp-btn').forEach(btn => {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.exp-btn').forEach(b => b.classList.remove('active'));
    this.classList.add('active');
  });
});
</script>
</body>
</html>"""

with open('adventures.html', 'w') as f:
    f.write(html)
print("adventures.html written.")
