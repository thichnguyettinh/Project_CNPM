(() => {
  const phoneNumber = '028 3822 8888';
  const phoneLink = 'tel:02838228888';

  const appMain = document.querySelector('.app-main');
  if (appMain) {
    let header = appMain.querySelector('.app-header');
    if (!header) {
      header = document.createElement('header');
      header.className = 'app-header';
      appMain.prepend(header);
    }

    let actions = header.querySelector('.header-actions');
    if (!actions) {
      actions = document.createElement('div');
      actions.className = 'header-actions';
      header.append(actions);
    }

    const contactLink = document.createElement('a');
    contactLink.className = 'btn btn-secondary btn-sm';
    contactLink.href = phoneLink;
    contactLink.textContent = `Liên hệ trung tâm: ${phoneNumber}`;
    actions.prepend(contactLink);
  }

  document.querySelectorAll('[data-center-phone]').forEach(element => {
    element.textContent = phoneNumber;
  });

  document.querySelectorAll('[data-center-phone-link]').forEach(element => {
    element.setAttribute('href', phoneLink);
  });
})();
