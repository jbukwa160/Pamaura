if ( typeof InfoTabs !== 'function' ) {

	class InfoTabs extends HTMLElement {

		constructor(){

			super();

			this.tabs = this.querySelectorAll('.js-info-tab');
			this.panels = this.querySelectorAll('.js-info-panel');
			this.togglers = this.querySelector('.info-tabs_togglers');
			this.index = 0;
			this.timeout = null;
			this._timeoutInterval = parseInt(this.dataset.tabsAutoplayTimer*1000);

			this.mobileNav = document.querySelectorAll(`#info-tabs-navigation-${this.dataset.id} .css-slider-dot`);
			this.mobileNavPrev = document.querySelector(`#info-tabs-navigation-${this.dataset.id} .css-slider-prev`);
			this.mobileNavNext = document.querySelector(`#info-tabs-navigation-${this.dataset.id} .css-slider-next`);

			this.zIndex = 99;
			this.pdpSet = this.closest('.info-tabs-pdp-set');

			if ( window.innerWidth < 768 || this.pdpSet != undefined) {
				this.dataset.tabsAutoplay = "false";
			}

			if (this.dataset.tabsAutoplay == "true" && this.tabs.length > 1 ) {
				this.autoplay(this._timeoutInterval, true);
				this.togglers.addEventListener('mouseover', () => {
					if ( this.timeout > 0 ) {
						this._timeoutRemaining = this._timeoutInterval - (new Date().getTime() - this._timeoutStart);
						clearTimeout(this.timeout);
						this.timeout = 0;
					}
				});

				this.togglers.addEventListener('mouseleave', () => {
					this.autoplay(this._timeoutRemaining, true);
					this._timeoutInterval = this._timeoutRemaining;
				});

			}

			this.index = 0;
			this.SCROLL_EVENT = debounce(()=>{
				if ( ! this._blockScroll ) {
					const scrollItems = this.tabs.entries();
					const scrollArray = Array.from(scrollItems, elm => (elm[1].offsetLeft-this.togglers.scrollLeft) + elm[1].offsetWidth);
					const scrollIndex = scrollArray.reduce((bestIdx, current, idx) => {
						return (current <= window.innerWidth && (bestIdx === -1 || Math.abs(scrollArray[bestIdx] - window.innerWidth) > Math.abs(current - window.innerWidth))) ? idx : bestIdx;
					}, -1);
					if ( scrollIndex != this.index ) {
						this.index = scrollIndex;
						this.clickTab(this.tabs[this.index]);
					}
				}
			}, 10);

			this.togglers.addEventListener('scroll', this.SCROLL_EVENT, {passive:true});

			this.tabs.forEach(tab => {
				tab.addEventListener('click', e=>{
					if ( ! e.currentTarget.classList.contains('active') ) {
						this.clickTab(e.currentTarget);
						if ( window.innerWidth < 768 || this.pdpSet != undefined) {
							this.togglers.scrollTo({
								left: e.currentTarget.offsetLeft - 40,
								behavior: 'smooth'
							});
						}
					}
				});
			});

			this.mobileNavPrev?.addEventListener('click', ()=>{
				if ( this.index - 1 >= 0 ) {
					this.index--;
					this.clickTab(this.tabs[this.index]);
					this.togglers.scrollTo({
						left: this.tabs[this.index].offsetLeft - 40,
						behavior: 'smooth'
					});
				}
			});

			this.mobileNavNext?.addEventListener('click', ()=>{
				if ( this.index + 1 < this.tabs.length ) {
					this.index++;
					this.clickTab(this.tabs[this.index]);
					this.togglers.scrollTo({
						left: this.tabs[this.index].offsetLeft - 40,
						behavior: 'smooth'
					});
				}
			});

		}

		clickTab(tab) {

			const panelID = tab.getAttribute('rel');
			const panel = document.getElementById(`panel-${panelID}`);
			this.reset();

			this.index = parseInt(tab.dataset.index);
			tab.classList.add('active');

			this.slideDown(tab.querySelector('.info-tabs__tab-caption'), 200);

			if ( panel ) {
				panel.classList.add('active');
				panel.style.zIndex = ++this.zIndex;
				panel.style.opacity = 1;
			}

			this.mobileNav.forEach((elm, index) => {
				if ( index == this.index ) {
					elm.classList.add('active');
				} else {
					elm.classList.remove('active');
				}
			});
			this.mobileNavNext.classList.remove('disabled');
			this.mobileNavPrev.classList.remove('disabled');
			if ( this.index == 0 ) {
				this.mobileNavPrev.classList.add('disabled');
			} else if ( this.index + 1 == this.tabs.length ) {
				this.mobileNavNext.classList.add('disabled');
			}

      this._blockScroll = true;
      setTimeout(()=>{
        this._blockScroll = false;
      }, 500);

		}

		autoplay(delay, reset = false) {
			if ( reset ) {
				this._timeoutStart = new Date().getTime();
			}
			this.timeout = setTimeout(()=>{
				if (this.index + 1 >= this.tabs.length) {
					this.index = 0;
				} else {
					this.index++;
				}
				this.tabs[this.index].click();
				this._timeoutInterval = parseInt(this.dataset.tabsAutoplayTimer*1000);
				this.autoplay(this._timeoutInterval, true);
			}, delay);
		}

		reset() {
			clearTimeout(this.timeout);
			this._timeoutInterval = parseInt(this.dataset.tabsAutoplayTimer*1000);
			this._timeoutRemaining = this._timeoutInterval;
			this.querySelectorAll('.active').forEach(elm => {
				if ( elm.querySelector('.info-tabs__tab-caption') ) {
					this.slideUp(elm.querySelector('.info-tabs__tab-caption'), 200);
				}
				elm.classList.remove('active');
			});
		}

		slideUp(target, duration){
			if ( window.innerWidth >= 768 || this.pdpSet != undefined) {
				target.style.transitionProperty = 'height, margin, padding';
				target.style.transitionDuration = duration + 'ms';
				target.style.boxSizing = 'border-box';
				target.style.height = target.offsetHeight + 'px';
				target.offsetHeight;
				target.style.overflow = 'hidden';
				target.style.height = 0;
				target.style.paddingTop = 0;
				target.style.paddingBottom = 0;
				target.style.marginTop = 0;
				target.style.marginBottom = 0;
				setTimeout(()=>{
					target.style.display = 'none';
					target.style.removeProperty('height');
					target.style.removeProperty('padding-top');
					target.style.removeProperty('padding-bottom');
					target.style.removeProperty('margin-top');
					target.style.removeProperty('margin-bottom');
					target.style.removeProperty('overflow');
					target.style.removeProperty('transition-duration');
					target.style.removeProperty('transition-property');
				}, duration);
			}
		}
		slideDown(target, duration) {
			if ( window.innerWidth >= 768 || this.pdpSet != undefined) {
				target.style.removeProperty('display');
				var display = window.getComputedStyle(target).display;

				if (display === 'none')
					display = 'block';

				target.style.display = display;
				var height = target.offsetHeight;
				target.style.overflow = 'hidden';
				target.style.height = 0;
				target.style.paddingTop = 0;
				target.style.paddingBottom = 0;
				target.style.marginTop = 0;
				target.style.marginBottom = 0;
				target.offsetHeight;
				target.style.boxSizing = 'border-box';
				target.style.transitionProperty = "height, margin, padding";
				target.style.transitionDuration = duration + 'ms';
				target.style.height = height + 'px';
				target.style.removeProperty('padding-top');
				target.style.removeProperty('padding-bottom');
				target.style.removeProperty('margin-top');
				target.style.removeProperty('margin-bottom');
				setTimeout(()=>{
					target.style.removeProperty('height');
					target.style.removeProperty('overflow');
					target.style.removeProperty('transition-duration');
					target.style.removeProperty('transition-property');
				}, duration);
			}
		}

	}

  if ( typeof customElements.get('info-tabs') == 'undefined' ) {
    customElements.define('info-tabs', InfoTabs);
	}

}