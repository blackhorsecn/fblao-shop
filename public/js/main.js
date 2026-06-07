(function () {
  'use strict';

  var modal = document.getElementById('buyModal');
  if (!modal) return;

  var form = document.getElementById('buyForm');
  var elProduct = document.getElementById('m-product');
  var elProductId = document.getElementById('m-product-id');
  var elQty = document.getElementById('m-qty');
  var elUnit = document.getElementById('m-unit');
  var elTotal = document.getElementById('m-total');
  var elManualId = document.getElementById('m-manual-id');

  var current = { price: 0, stock: 1, min: 1 };
  var currencySymbol = '₱'; // ₱

  function fmt(n) {
    return currencySymbol + Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function recalc() {
    var q = parseInt(elQty.value, 10) || current.min;
    if (q < current.min) q = current.min;
    if (q > current.stock) q = current.stock;
    elQty.value = q;
    elUnit.textContent = fmt(current.price);
    elTotal.textContent = fmt(current.price * q);
  }

  function openModal(btn) {
    current.price = parseFloat(btn.getAttribute('data-price')) || 0;
    current.stock = parseInt(btn.getAttribute('data-stock'), 10) || 1;
    current.min = parseInt(btn.getAttribute('data-min'), 10) || 1;
    elProduct.textContent = btn.getAttribute('data-name');
    elProductId.value = btn.getAttribute('data-id');
    elQty.value = current.min;
    elQty.min = current.min;
    elQty.max = current.stock;
    recalc();
    modal.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    modal.classList.remove('is-open');
    document.body.style.overflow = '';
  }

  document.querySelectorAll('.btn-buy').forEach(function (btn) {
    btn.addEventListener('click', function () { openModal(btn); });
  });

  document.getElementById('modalClose').addEventListener('click', closeModal);
  modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !modal.hidden) closeModal(); });

  elQty.addEventListener('input', recalc);

  // Keep the hidden manual_method_id in sync with the chosen radio option.
  form.querySelectorAll('input[name="payment_type"]').forEach(function (radio) {
    radio.addEventListener('change', function () {
      var manual = radio.getAttribute('data-manual');
      elManualId.value = radio.value === 'manual' && manual ? manual : '';
    });
  });
  // Initialize on load (first radio may be a manual method when Maya is disabled).
  var checked = form.querySelector('input[name="payment_type"]:checked');
  if (checked) {
    var m = checked.getAttribute('data-manual');
    elManualId.value = checked.value === 'manual' && m ? m : '';
  }

  // --- Mobile Menu Toggle ---
  var menuToggle = document.getElementById('menuToggle');
  var mainNav = document.getElementById('mainNav');
  if (menuToggle && mainNav) {
    menuToggle.addEventListener('click', function (e) {
      e.stopPropagation();
      mainNav.classList.toggle('is-open');
    });

    document.addEventListener('click', function (e) {
      if (!mainNav.contains(e.target) && e.target !== menuToggle) {
        mainNav.classList.remove('is-open');
      }
    });
  }
})();
