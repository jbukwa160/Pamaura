if (typeof ProductPage !== 'function') {

	class ProductPage extends HTMLElement {

		constructor() {

			super();

			this.productGallery = this.querySelector('[data-js-product-gallery]');
			this.productSlider = this.querySelector('css-slider');

			this.pickupAvailabilityExtended = this.querySelector('pickup-availability-extended');

			// Gallery thumbnails
			if (this.productSlider) {

				const productGaleryThumbnails = this.querySelector('.product-gallery__thumbnails-holder');

				if (this.querySelector('.product-gallery__thumbnails .thumbnail')) {

					this.querySelectorAll('.product-gallery__thumbnails .thumbnail').forEach((elm, i) => {
						if (i == 0) {
							elm.classList.add('active');
						}
						elm.addEventListener('click', e => {
							if (this.productSlider.sliderEnabled) {
								this.productSlider.changeSlide(e.currentTarget.dataset.index);
							} else {
								window.scrollTo({
									top: this.productGallery.querySelector(`.product-gallery-item[data-index="${e.currentTarget.dataset.index}"]`).getBoundingClientRect().top + window.scrollY,
									behavior: 'smooth'
								});
								this.thumbnailNavigationHelper(e.currentTarget.dataset.index);
							}
							this._pauseAllMedia();
							this._playMedia(this.productGallery.querySelector(`.product-gallery-item[data-index="${e.currentTarget.dataset.index}"]`));
							productGaleryThumbnails.scrollTo({
								left: elm.offsetLeft - 50,
								behaviour: 'smooth'
							})
						});
					})

					this.productSlider.addEventListener('change', e => {
						this.thumbnailNavigationHelper(e.target.index);
					});

				}

				this.productSlider.addEventListener('navigation', e => {
					this._playMedia(this.productGallery.querySelector(`.product-gallery-item[data-index="${e.target.index}"]`));
				})
				this.productSlider.addEventListener('change', e => {
					this._pauseAllMedia();
					if (this.productGallery.querySelector(`.product-gallery-item[data-index="${e.target.index}"]`).dataset.productMediaType == 'model') {
						if (this.xrButton) {
							this.xrButton.setAttribute('data-shopify-model3d-id', this.productGallery.querySelector(`.product-gallery-item[data-index="${e.target.index}"]`).dataset.mediaId);
						}
						setTimeout(() => {
							this.productSlider.querySelector('.css-slider-holder').classList.add('css-slider--disable-dragging');
						}, 150);
					}
				});

				// Parallax

				this.productSlider.addEventListener('ready', (e) => {
					if (this.firstProductGalleryIndex) {
						this.productSlider.changeSlide(this.firstProductGalleryIndex, "auto");
					}
				});

			}

			// Product variant event listener for theme specific logic

			this.productVariants = this.querySelector('product-variants[data-main-product-variants]');
			if (this.productVariants) {
				this.productVariants.addEventListener('VARIANT_CHANGE', this.onVariantChangeHandler.bind(this));
				this.onVariantChangeHandler({ target: this.productVariants });

				// refresh color
				this.querySelectorAll('.product-variant__item--radio').forEach(elm => {
					elm.addEventListener('click', e => {
						if (elm.classList.contains('product-variant__item--color')) {
							elm.closest('.product-variant').querySelector('.product-variant__item-text-label').textContent = elm.querySelector('input').value;
						}
					})
				});

			}

			// show cart drawer when element is added to cart

			if (!document.body.classList.contains('template-cart') && KROWN.settings.cart_action == 'overlay') {

				let addToCartEnter = false;
				if (this.querySelector('[data-js-product-add-to-cart]')) {
					this.querySelector('[data-js-product-add-to-cart]').addEventListener('keyup', e => {
						if (e.keyCode == window.KEYCODES.RETURN) {
							addToCartEnter = true;
						}
					})
				}

				if (this.querySelector('[data-js-product-form]')) {

					function handleElement(element) {
						element.addEventListener('click', (e) => {
							e.preventDefault();
							const upsellPopup = document.querySelector('upsell-popup');
							if(upsellPopup) {
								document.querySelector('#site-cart-sidebar').classList.add('force-close');
								upsellPopup.variantTitle = item.variant_title;
								upsellPopup.UpdateProductDescriptions();
								upsellPopup.OpenUpsellPopup();
							}
						});
					}
					const observer = new MutationObserver((mutationsList, observer) => {
						for (let mutation of mutationsList) {
							if (mutation.type === 'childList') {
								const element = document.querySelector('.lb-card-atc-btn');
								if (element) {
									handleElement(element);
									observer.disconnect();
									break;
								}
							}
						}
					});

					const timeout = setTimeout(() => {
						observer.disconnect();
					}, 10000);

					observer.observe(document.body, { childList: true, subtree: true });

					this.querySelector('[data-js-product-form]').addEventListener('add-to-cart', () => {
						const upsellPopup = document.querySelector('upsell-popup');
						document.querySelectorAll('.add-to-cart--giftbox').forEach(btn => {
							btn.disabled = false;
						});
						if(upsellPopup) {
							upsellPopup.variantTitle = item.variant_title;
							upsellPopup.UpdateProductDescriptions();
							upsellPopup.OpenUpsellPopup();
						} else {
							document.getElementById('site-cart-sidebar').show();
						}
						if (document.getElementById('cart-recommendations-sidebar')) {
							document.getElementById('cart-recommendations-sidebar').generateRecommendations();
						}
						if (addToCartEnter) {
							setTimeout(() => {
								document.querySelector('#site-cart-sidebar [data-js-close]').focus();
							}, 200);
						}
					});
				}

			}

			// Check for models

			const models = this.querySelectorAll('product-model');
			if (models.length > 0) {
				window.ProductModel.loadShopifyXR();
				this.xrButton = this.querySelector('.product-gallery__view-in-space');
			}

			// hide buy now button if stock disabled

			const addToCartButton = this.querySelector('[data-js-product-add-to-cart][data-main-product-add-to-cart]');
			if (addToCartButton) {
				if (addToCartButton.classList.contains('disabled')) {
					this.querySelector('product-form').classList.add('disable-buy-button');
				} else {
					this.querySelector('product-form').classList.remove('disable-buy-button');
				}
				const buyObserver = new MutationObserver(() => {
					if (addToCartButton.classList.contains('disabled')) {
						this.querySelector('product-form').classList.add('disable-buy-button');
					} else {
						this.querySelector('product-form').classList.remove('disable-buy-button');
					}
				});
				buyObserver.observe(addToCartButton, { attributes: true, childList: false, subtree: false });
			}

			// update secondary price if present

			this.priceCompact = this.querySelector('[data-js-product-price-compact');
			this.priceExtended = this.querySelector('[data-js-product-price-extended');

			if (this.priceCompact) {
				this.priceCompact.priceOriginal = this.priceCompact.querySelector('[data-js-product-price-original]');
				this.priceCompact.priceCompare = this.priceCompact.querySelector('[data-js-product-price-compare]');
				this.priceCompact.priceUnit = this.priceCompact.querySelector('[data-js-product-price-unit]');
				this.priceCompact.priceSaving = this.priceCompact.querySelector('[data-js-product-price-saving]');
			}
			if (this.priceExtended) {
				this.priceExtended.priceOriginal = this.priceExtended.querySelector('[data-js-product-price-original]');
				this.priceExtended.priceCompare = this.priceExtended.querySelector('[data-js-product-price-compare]');
				this.priceExtended.priceSaving = this.priceExtended.querySelector('[data-js-product-price-saving]');
				this.priceExtended.priceUnit = this.priceExtended.querySelector('[data-js-product-price-unit]');
			}

		}

		thumbnailNavigationHelper(index = 0) {
			this.querySelectorAll('.product-gallery__thumbnails .thumbnail').forEach((elm, i) => {
				if (i == index)
					elm.classList.add('active');
				else
					elm.classList.remove('active');
			});
		}

		onVariantChangeHandler(e) {

			let variant = e.target.currentVariant;
			if (variant) {

				// image handling

				// if (variant.featured_media != null) {
				// 	let variantImg = this.productGallery.querySelector('.product-gallery-item[data-media-id="' + variant.featured_media.id + '"]');
				// 	if (variantImg) {
				// 		if (this.productGallery.classList.contains('product-gallery--slider') || (this.productGallery.classList.contains('product-gallery--scroll') && window.innerWidth < 1024)) {
				// 			if (this.productGallery.querySelector('css-slider') && this.productGallery.querySelector('css-slider').sliderEnabled) {
				// 				this.productGallery.querySelector('css-slider').changeSlide(variantImg.dataset.index);
				// 			} else {
				// 				this.firstProductGalleryIndex = variantImg.dataset.index;
				// 			}
				// 		} else {
				// 			window.scrollTo({
				// 				top: variantImg.getBoundingClientRect().top + window.scrollY,
				// 				behavior: 'smooth'
				// 			});
				// 		}
				// 	}
				// }

				// refresh pickup availability widgets

				if (this.pickupAvailabilityExtended && this.pickupAvailabilityExtended.classList.contains('active')) {
					this.querySelector('pickup-availability-extended').fetchAvailability(variant.id);
				}

			}

			// update sticky add to cart button
			const variantStickyAddToCart = document.querySelector('[data-js-choose]');
			const atcText = this.querySelector('[data-js-product-add-to-cart] .button__text').innerText;
			const stickyTextTemplate = `
			<svg width="18" height="16" viewBox="0 0 18 16" fill="none" xmlns="http://www.w3.org/2000/svg">
				<path d="M13.9373 11.4824H7.33317C6.55006 11.4824 5.85615 10.9577 5.64685 10.2069L3.41411 2.41375C3.28768 1.96285 2.8726 1.64961 2.40273 1.64961H0.653905C0.460059 1.64961 0.302734 1.49228 0.302734 1.29844C0.302734 1.10459 0.460059 0.947266 0.653905 0.947266H2.40273C3.18584 0.947266 3.87976 1.47191 4.08906 2.22272L4.52942 3.75663H16.1047C16.4411 3.75663 16.7495 3.91114 16.9496 4.18084C17.1505 4.45054 17.2102 4.79048 17.1133 5.11215L15.6025 10.2744C15.3595 11.002 14.6916 11.4824 13.9373 11.4824ZM4.73029 4.45897L6.3225 10.0159C6.44822 10.4668 6.8633 10.78 7.33317 10.78H13.9373C14.3826 10.78 14.7913 10.4858 14.9318 10.0651L16.4411 4.91128C16.4734 4.80382 16.4531 4.69074 16.3863 4.60084C16.3196 4.51024 16.2171 4.45897 16.1047 4.45897H4.73029Z" fill="white" stroke="white" stroke-width="0.592593"></path>
				<path d="M6.94305 15.6325C6.37967 15.6325 5.92151 15.1743 5.92151 14.6109C5.92151 14.0475 6.37967 13.5894 6.94305 13.5894C7.50642 13.5894 7.96458 14.0475 7.96458 14.6109C7.96458 15.1743 7.50642 15.6325 6.94305 15.6325Z" fill="white" stroke="white" stroke-width="0.592593"></path>
				<path d="M13.9664 15.6325C13.403 15.6325 12.9449 15.1743 12.9449 14.6109C12.9449 14.0475 13.403 13.5894 13.9664 13.5894C14.5298 13.5894 14.988 14.0475 14.988 14.6109C14.988 15.1743 14.5298 15.6325 13.9664 15.6325Z" fill="white" stroke="white" stroke-width="0.592593"></path>
			</svg>
			<span class="button_text" data-js-product-add-to-cart-text="">${atcText}</span>
			</svg>`
			if (variantStickyAddToCart) {
				variantStickyAddToCart.classList.add('sticky-add-to-cart__actions-item');
			}

			if (variantStickyAddToCart && variant) {
				if (variant.compare_at_price > variant.price) {
					variantStickyAddToCart.innerHTML = `${stickyTextTemplate} <span class="button_price">- <span>${this.productVariants._formatMoney(variant.price, KROWN.settings.shop_money_format)}</span> <del>${this.productVariants._formatMoney(variant.compare_at_price, KROWN.settings.shop_money_format)}</del></span>`;
					variantStickyAddToCart.setAttribute('data-choose-multiple', 'true');
				} else {
					variantStickyAddToCart.innerHTML = `${stickyTextTemplate} <span class="button_price">- <span>${this.productVariants._formatMoney(variant.price, KROWN.settings.shop_money_format)}</span></span>`;
					variantStickyAddToCart.setAttribute('data-choose-multiple', 'true');
				}
			}

			// update prices (overwrites the framework)

			if (this.priceCompact) {
				if (!variant) {
					if (!(this.productVariants.variantRequired && this.productVariants.noVariantSelectedYet)) {
						this.priceCompact.classList.add('hide');
						this.priceCompact.priceOriginal.innerHTML = '';
						this.priceCompact.priceCompare.innerHTML = '';
						this.priceCompact.priceUnit.innerHTML = '';
					}
				} else {
					this.priceCompact.classList.remove('hide');
					this.priceCompact.priceOriginal.innerHTML = this.productVariants._formatMoney(variant.price, KROWN.settings.shop_money_format);
					if (variant.compare_at_price > variant.price) {
						this.priceCompact.priceCompare.innerHTML = this.productVariants._formatMoney(variant.compare_at_price, KROWN.settings.shop_money_format);
						if (!this.priceCompact.priceOriginal.classList.contains('discounted-price')) {
							this.priceCompact.priceOriginal.classList.add('discounted-price');
						}
						const savingsPercentage = ((variant.compare_at_price - variant.price) / variant.compare_at_price * 100).toFixed(2);
						this.priceCompact.priceSaving.innerHTML = `<span>${KROWN.settings.locales.product_compare_price.replace('$SAVE_PRICE', `${savingsPercentage}%`)}</span>`;
						//this.priceCompact.priceCompare.innerHTML = `<span>${this.productVariants._formatMoney(variant.compare_at_price, KROWN.settings.shop_money_format)}</span><span class="product-item__badge">-${Math.round(Math.abs((variant.price * 100 / variant.compare_at_price) - 100))}%</span>`;
					} else {
						this.priceCompact.priceCompare.innerHTML = '';
						if (this.priceCompact.priceSaving) {
						this.priceCompact.priceSaving.innerHTML = '';
						}
						if (this.priceCompact.priceOriginal.classList.contains('discounted-price')) {
							this.priceCompact.priceOriginal.classList.remove('discounted-price');
						}
					}

					if (variant.unit_price_measurement) {
						this.priceCompact.priceUnit.innerHTML = `
							${this.productVariants._formatMoney(variant.unit_price, KROWN.settings.shop_money_format)} /
							${(variant.unit_price_measurement.reference_value != 1 ? variant.unit_price_measurement.reference_value + ' ' : '')}
							${variant.unit_price_measurement.reference_unit}
						`;
					} else {
						this.priceCompact.priceUnit.innerHTML = '';
					}
				}
			}

			if (this.priceExtended) {
				if (!variant) {
					this.priceExtended.classList.add('hide');
					this.priceExtended.priceOriginal.innerHTML = '';
					this.priceExtended.priceCompare.innerHTML = '';
					this.priceExtended.priceUnit.innerHTML = '';
					this.priceExtended.priceSaving.innerHTML = '';
				} else {
					this.priceExtended.classList.remove('hide');
					this.priceExtended.priceOriginal.innerHTML = this.productVariants._formatMoney(variant.price, KROWN.settings.shop_money_format);
					if (variant.compare_at_price > variant.price) {
						this.priceExtended.priceCompare.innerHTML = `<span>${this.productVariants._formatMoney(variant.compare_at_price, KROWN.settings.shop_money_format)}</span>`;
						this.priceExtended.priceSaving.innerHTML = `<span>${KROWN.settings.locales.product_compare_price.replace('$SAVE_PRICE', this.productVariants._formatMoney(variant.compare_at_price - variant.price, KROWN.settings.shop_money_format))}</span>`;
					} else {
						this.priceExtended.priceCompare.innerHTML = '';
						this.priceExtended.priceSaving.innerHTML = '';
					}

					if (variant.unit_price_measurement) {
						this.priceExtended.priceUnit.innerHTML = `
							${this.productVariants._formatMoney(variant.unit_price, KROWN.settings.shop_money_format)} /
							${(variant.unit_price_measurement.reference_value != 1 ? variant.unit_price_measurement.reference_value + ' ' : '')}
							${variant.unit_price_measurement.reference_unit}
						`;
					} else {
						this.priceExtended.priceUnit.innerHTML = '';
					}
				}
			}

		}

		_pauseAllMedia() {

			document.querySelectorAll('.product-gallery .js-youtube').forEach(video => {
				video.contentWindow.postMessage('{"event":"command","func":"' + 'pauseVideo' + '","args":""}', '*');
			});
			document.querySelectorAll('.product-gallery .js-vimeo').forEach(video => {
				video.contentWindow.postMessage('{"method":"pause"}', '*');
			});
			document.querySelectorAll('.product-gallery video').forEach(video => video.pause());
			document.querySelectorAll('.product-gallery product-model').forEach(model => {
				if (model.modelViewerUI)
					model.modelViewerUI.pause()
			});
		}

		_playMedia(media) {
			switch (media.dataset.productMediaType) {
				case 'video':
					if (media.querySelector('video')) {
						media.querySelector('video').play();
					}
					break;
				case 'external_video-youtube':
					if (media.querySelector('.js-youtube')) {
						media.querySelector('.js-youtube').contentWindow.postMessage('{"event":"command","func":"' + 'playVideo' + '","args":""}', '*');
					}
					break;
				case 'external_video-vimeo':
					if (media.querySelector('.js-vimeo')) {
						media.querySelector('.js-vimeo').contentWindow.postMessage('{"method":"play"}', '*');
					}
					break;
			}
		}

	}

	if (typeof customElements.get('product-page') == 'undefined') {
		customElements.define('product-page', ProductPage);
	}

}

var UpsellPopupProduct = class extends HTMLElement {
	constructor() {
		super();
		this.productInput = this.querySelector("input.upsell-product-input");
		this.addButton = this.querySelector("button.upsell-popup-add-button");
		this.removeButton = this.querySelector("button.upsell-popup-remove-button");
		this.variantId = this.dataset.variantId;
		this.shortDescriptionEl = this.querySelector("span.short-description-text");
		this.defaultTitle = this.shortDescriptionEl?.textContent;
		this.texts = {
			textAdded: this.dataset.textAdded,
			textAdd: this.dataset.textAdd,
		};
	}

	connectedCallback() {
		this.addButton?.addEventListener("click", this.addProduct.bind(this));
		this.removeButton?.addEventListener("click", this.removeProduct.bind(this));
	}

	disconnectedCallback() {
		this.addButton?.removeEventListener("click", this.addProduct);
		this.removeButton?.removeEventListener("click", this.removeProduct);
	}

	updateDescription(variantTitle) {
		if (this.defaultTitle) {
			let newTitle = this.defaultTitle.replace("$$$", variantTitle);
			this.shortDescriptionEl.innerHTML = newTitle;
		}
	}

	addProduct() {
		this.classList.add("added");
		this.addButton.disabled = true;
		this.productInput.value = this.variantId;
		this.textEl = this.addButton.querySelector("span.button-text");
		this.textEl.innerHTML = this.texts.textAdded;
	}

	removeProduct() {
		this.classList.remove("added");
		this.addButton.disabled = false;
		this.productInput.value = "";
		this.textEl = this.addButton.querySelector("span.button-text");
		this.textEl.innerHTML = this.texts.textAdd;
	}
};

if (!window.customElements.get("upsell-popup-product")) {
	window.customElements.define("upsell-popup-product", UpsellPopupProduct);
}

var UpsellPopup = class extends HTMLElement {

	constructor() {
		super();
		this.inputs = this.querySelectorAll('input.upsell-product-input');
		this.AtcButton = this.querySelector('.upsell-popup-accept-btn');
		this.declineButton = this.querySelector('.upsell-popup-decline-btn');
		this.overlay = this.querySelector('.upsell-popup-overlay');
		this.timer = this.querySelector("countdown-timer");
		this.closeButton = this.querySelector('.upsell-popup-close-btn');
		this.productCards = this.querySelectorAll('upsell-popup-product');
		this.variantTitle = "Default Title";
	}

	connectedCallback() {
		this.AtcButton?.addEventListener('click', this.AddProducts.bind(this));
		this.declineButton?.addEventListener('click', this.DeclineOffer.bind(this));
		this.overlay?.addEventListener('click', this.DeclineOffer.bind(this));
		this.closeButton?.addEventListener('click', this.DeclineOffer.bind(this));
	}

	disconnectedCallBack() {
		this.AtcButton?.removeEventListener('click', this.AddProducts);
		this.declineButton?.removeEventListener('click', this.DeclineOffer);
		this.overlay?.removeEventListener('click', this.DeclineOffer);
		this.closeButton?.removeEventListener('click', this.DeclineOffer);
	}

	UpdateProductDescriptions() {
		this.productCards.forEach(productCard => {
			productCard.updateDescription(this.variantTitle);
		});
	}

	AddProducts() {
		this.submitProducts();
		this.CloseUpsell();
	}

	submitProducts() {
		const formData = this.getVariants();
		const mainProductId = this.dataset.mainProductId;
		formData.items = formData.items.map(item => ({
			...item,
			properties: {
			  _main_product_id: mainProductId
			}
		}));

		fetch(`${KROWN.settings.routes.cart_add_url}.js`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(formData)
		})
		.then(response => response.json())
		.then(response => {
			if ( response.status == 422 ) {
				alert = document.createElement('span');
				alert.className = 'alert alert--error';
				alert.innerHTML = response.description
				return fetch('?section_id=helper-cart');
			} else {
				return fetch('?section_id=helper-cart');
			}
		})
		.then(response => response.text())
		.then(text => {
			if ( document.getElementById('site-cart-sidebar') ) {
				const sectionInnerHTML = new DOMParser().parseFromString(text, 'text/html');
				const cartFormInnerHTML = sectionInnerHTML.getElementById('AjaxCartForm').innerHTML;
				const cartSubtotalInnerHTML = sectionInnerHTML.getElementById('AjaxCartSubtotal').innerHTML;
				const cartItems = document.getElementById('AjaxCartForm');
				cartItems.innerHTML = cartFormInnerHTML;
				cartItems.ajaxifyCartItems();
				document.querySelectorAll('[data-header-cart-count]').forEach(elm=>{
					elm.innerHTML = document.querySelector('#AjaxCartForm [data-cart-count]').innerHTML;
				});
				if ( document.getElementById('cart-recommendations-sidebar') ) {
					document.getElementById('cart-recommendations-sidebar').generateRecommendations();
				}
				document.getElementById('AjaxCartSubtotal').innerHTML = cartSubtotalInnerHTML;
			}
			document.getElementById('site-cart-sidebar').show();
		})
		.catch((error) => {
			console.error('Error:', error);
		});
	}

	getVariants() {
		let data = { items: [] };
		let tempData = [];
		this.inputs.forEach(input => {
			if (input.value != "") {
				const variantId = input.value * 1;
				tempData = {
					id: variantId,
					quantity: 1
				}
				data.items.push(tempData);
			}
		});
		return data;
	}

	CloseUpsell() {
		this.classList.remove('upsell-opened');
		document.documentElement.classList.remove('stop_scroll');
		document.body.classList.remove('scroll-lock');
		document.querySelector('#site-cart-sidebar').classList.remove('force-close');
		let elem = this;
		setTimeout(function () {
			elem?.parentElement?.removeChild(elem);
		}, 500);
	}

	DeclineOffer() {
		this.CloseUpsell();
		setTimeout(() => {
			document.getElementById('site-cart-sidebar').show();
		}, 300);
	}

	OpenUpsellPopup() {
		document.documentElement.classList.add('stop_scroll');
		document.body.classList.add('scroll-lock');
		this.classList.add('upsell-opened');
		this.timer.startTimer();
	}

}

if (!window.customElements.get("upsell-popup")) {
	window.customElements.define("upsell-popup", UpsellPopup);
}

var CountDownTimer = class extends HTMLElement {
	constructor() {
	  super();
	  this.component = this;
	  this.secondsEl = this.querySelector(".js-timer-seconds");
	  this.minutesEl = this.querySelector(".js-timer-minutes");
	  this.hoursEl = this.querySelector(".js-timer-hours");
	  this.daysEl = this.querySelector(".js-timer-days");
	  this.counterType = this.dataset.timerType;
	  if (this.counterType === "upsell-timer") {
		this.upsellPopup = this.closest("upsell-popup");
	  }
	}

	connectedCallback() {
	  if (this.counterType != "upsell-timer") {
		this.startTimer();
	  }
	}

	disconnectedCallback() {}

	startTimer() {
	  if (this.counterType === "upsell-timer") {
		let timerTime = 5 * 60 * 1000;
		this.endTime = new Date().getTime() + timerTime;
	  } else {
		this.endTime = new Date(this.dataset.endDate).getTime();
	  }
	  this.updateTimer(this.component);
	}

	updateTimer(component) {
	  let second = 1000,
		minute = second * 60,
		hour = minute * 60,
		day = hour * 24,
		endTime = component.endTime,
		timeNow = new Date().getTime() + 1,
		timeLeft = endTime - timeNow;
	  let tempString = "";

	  if (timeLeft > 0) {
		if (component.secondsEl) {
		  let seconds = Math.floor((timeLeft % minute) / second);
		  seconds < 10 ? (tempString = "0" + seconds) : (tempString = seconds);
		  component.secondsEl.innerHTML = tempString;
		}
		if (component.minutesEl) {
		  let minutes = Math.floor((timeLeft % hour) / minute);
		  minutes < 10 ? (tempString = "0" + minutes) : (tempString = minutes);
		  component.minutesEl.innerHTML = tempString;
		}
		if (component.hoursEl) {
		  let hours = Math.floor((timeLeft % day) / hour);
		  hours < 10 ? (tempString = "0" + hours) : (tempString = hours);
		  component.hoursEl.innerHTML = tempString;
		}
		if (component.daysEl) {
		  let days = Math.floor(timeLeft / day);
		  days < 10 ? (tempString = "0" + days) : (tempString = days);
		  component.daysEl.innerHTML = tempString;
		}
		setTimeout(component.updateTimer, 1000, component);
	  } else {
		if (component.counterType === "upsell-timer") {
		  component.upsellPopup?.CloseUpsell();
		}
	  }
	}
  };

  if (!window.customElements.get("countdown-timer")) {
	window.customElements.define("countdown-timer", CountDownTimer);
  }