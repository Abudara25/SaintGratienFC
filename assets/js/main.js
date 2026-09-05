// Saint-Gratien FC — interactions front-end (menu mobile, header au scroll, reveal, filtres actus)

document.addEventListener('DOMContentLoaded', () => {
  initHeader();
  initMobileNav();
  initReveal();
  initNewsFilters();
  markActiveNavLink();
  initPlaceholderLinks();
  initArticleLightbox();
  initNewsletterForms();
  initMapsConsent();
  initAdhesionCtaStatus();
});

function initNewsletterForms() {
  // Formulaire newsletter sans backend (placeholder) : on bloque juste le submit natif.
  document.querySelectorAll('form.newsletter').forEach((form) => {
    form.addEventListener('submit', (e) => e.preventDefault());
  });
}

function initMapsConsent() {
  // La carte Google Maps n'est chargée qu'après un clic explicite (Google peut déposer
  // des cookies dès le chargement de l'iframe, donc pas de chargement automatique).
  document.querySelectorAll('.map-embed').forEach((container) => {
    const btn = container.querySelector('.map-embed-btn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const iframe = document.createElement('iframe');
      iframe.src = container.dataset.mapSrc;
      iframe.width = '100%';
      iframe.height = '100%';
      iframe.style.border = '0';
      iframe.style.display = 'block';
      iframe.loading = 'lazy';
      iframe.referrerPolicy = 'no-referrer-when-downgrade';
      iframe.title = container.dataset.mapTitle || 'Carte';
      container.replaceChildren(iframe);
    });
  });
}

function initAdhesionCtaStatus() {
  // Présent sur les 6 pages (header + le CTA du hero sur index.html) : relabellisé en "Inscriptions
  // fermées" quand le club a fermé les inscriptions (voir /admin/inscriptions), pour ne pas laisser
  // croire que c'est encore ouvert avant même d'avoir cliqué. Reste cliquable — la page inscription
  // explique pourquoi et propose de nous contacter. Même endpoint que inscription.html
  // (assets/js/inscription.js), interrogé séparément ici : ce sont deux besoins différents (bouton
  // du header vs formulaire de la page), pas de source commune simple sans dupliquer le fetch.
  const ctas = document.querySelectorAll('.adhesion-cta');
  if (!ctas.length) return;

  fetch('/api/inscription-status')
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      if (data?.status !== 'closed') return;
      ctas.forEach((el) => {
        el.textContent = 'Inscriptions fermées';
        el.classList.remove('btn-primary');
        el.classList.add('btn-dark');
      });
    })
    .catch(() => {}); // en cas d'échec, le bouton garde son libellé par défaut ("Devenir adhérent")
}

function initPlaceholderLinks() {
  // Les liens sans destination réelle (ex: "Lire la suite" en attendant de vraies pages d'articles)
  // utilisent href="#" : on evite qu'un clic remonte la page en haut sans rien faire d'autre.
  document.querySelectorAll('a[href="#"]').forEach((link) => {
    link.addEventListener('click', (e) => e.preventDefault());
  });
}

function initHeader() {
  const header = document.querySelector('.site-header');
  if (!header) return;
  const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 12);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
}

function initMobileNav() {
  const burger = document.querySelector('.burger');
  const nav = document.querySelector('.main-nav');
  if (!burger || !nav) return;

  const closeNav = () => {
    burger.classList.remove('is-active');
    nav.classList.remove('is-open');
    burger.setAttribute('aria-expanded', 'false');
  };

  burger.addEventListener('click', () => {
    const isOpen = nav.classList.toggle('is-open');
    burger.classList.toggle('is-active', isOpen);
    burger.setAttribute('aria-expanded', String(isOpen));
  });

  nav.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeNav));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeNav();
  });
}

function initReveal() {
  const items = document.querySelectorAll('[data-reveal]');
  if (!items.length) return;

  if (!('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('is-visible'));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });

  items.forEach((el, i) => {
    el.style.transitionDelay = `${Math.min(i % 4, 3) * 80}ms`;
    observer.observe(el);
  });
}

function initNewsFilters() {
  const filterBtns = document.querySelectorAll('.filter-btn');
  const cards = document.querySelectorAll('[data-category]');
  if (!filterBtns.length || !cards.length) return;

  filterBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      filterBtns.forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      const filter = btn.dataset.filter;

      cards.forEach((card) => {
        const match = filter === 'all' || card.dataset.category === filter;
        card.style.display = match ? '' : 'none';
      });
    });
  });
}

function initArticleLightbox() {
  const lightbox = document.getElementById('article-lightbox');
  const cards = document.querySelectorAll('article.card');
  if (!lightbox || !cards.length) return;

  const media = lightbox.querySelector('.lightbox-media');
  const dateEl = lightbox.querySelector('.lightbox-date');
  const titleEl = lightbox.querySelector('.lightbox-title');
  const textEl = lightbox.querySelector('.lightbox-text');

  const open = (card) => {
    const cardMedia = card.querySelector('.card-media');
    media.innerHTML = cardMedia ? cardMedia.innerHTML : '';
    dateEl.textContent = card.querySelector('.card-date')?.textContent || '';
    titleEl.textContent = card.querySelector('h3')?.textContent || '';
    textEl.textContent = card.querySelector('.card-body p')?.textContent || '';
    lightbox.classList.add('is-open');
    lightbox.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  };

  const close = () => {
    lightbox.classList.remove('is-open');
    lightbox.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  };

  cards.forEach((card) => {
    card.setAttribute('tabindex', '0');
    card.setAttribute('role', 'button');
    card.addEventListener('click', () => open(card));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open(card);
      }
    });
  });

  lightbox.querySelectorAll('[data-lightbox-close]').forEach((el) => el.addEventListener('click', close));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
}

function markActiveNavLink() {
  const current = (window.location.pathname.split('/').pop() || 'index.html');
  document.querySelectorAll('.main-nav a').forEach((link) => {
    const href = link.getAttribute('href');
    if (href === current || (current === '' && href === 'index.html')) {
      link.setAttribute('aria-current', 'page');
    }
  });
}
