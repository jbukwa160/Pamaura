if ( typeof MainHeader !== 'function' ) {

	class MainHeader extends HTMLElement {

		constructor(){
			super();
			this.mount();
		}

		mount(){

			/* -- > DRAWERS < -- */

			document.querySelectorAll('#main > div').forEach(elm=>{
				if ( ! elm.classList.contains('no-inert') ) {
					elm.setAttribute('data-js-inert', '');
				}
			})
			window.inertElems = document.querySelectorAll('[data-js-inert]');

			// Sticky header

			if ( this.hasAttribute('data-sticky-header') ) {

				const stickyHeader = document.createElement('div');
				stickyHeader.classList = 'sticky-header site-header'

				if ( this.classList.contains('site-header--style-one-row') ) {

					stickyHeader.innerHTML = `<div class="container--large">
						<div class="${this.querySelector('.header__top').className }" style="height:calc(var(--header-logo) + var(--header-vertical-space))">
							${this.querySelector('.header__top').innerHTML}
						</div>
					</div>`;
					stickyHeader.className = `sticky-header ${this.className}`;
					stickyHeader.classList.remove('site-header--absolute');

				} else {

					stickyHeader.innerHTML = `<div class="header__bottom header-container container--large portable-hide">
						${this.querySelector('.header__bottom').innerHTML}
						<div style="display:flex;gap:15px;">
							${this.querySelector('.area--custom-icon') ? this.querySelector('.area--custom-icon').outerHTML : ''}
							${this.querySelector('.area--search').outerHTML}
							${this.querySelector('.area--account') ? this.querySelector('.area--account').outerHTML : ''}
							${this.querySelector('.area--cart').outerHTML}
						</div>
					</div>
					<div class="site-header element--hide-on-portable-plus">
						${this.querySelector('.header-container--top').innerHTML}
					</div>`;

				}

				document.body.append(stickyHeader);

				stickyHeader.querySelectorAll('[id]').forEach(elm=>{
					elm.id = `${elm.id}-sticky`;
				})
				stickyHeader.querySelectorAll('.site-nav [aria-controls]').forEach(elm=>{
					elm.setAttribute('aria-controls', `${elm.getAttribute('aria-controls')}-sticky`);
				});

				window.lst = window.scrollY;
				window.lhp = 0;

				const stickyHeaderDeskBound =  this.classList.contains('site-header--style-one-row') ? this.querySelector('.header__top') : this.querySelector('.header__bottom');
				const stickyHeaderMobileBound = this.querySelector('.header__top');

				this.SCROLL_StickyHelper = () => {

					var st = window.scrollY;

					if ( ( st <= 0 || ( window.innerWidth >= 1024 ? stickyHeaderDeskBound.getBoundingClientRect().top >= 0 : stickyHeaderMobileBound.getBoundingClientRect().top >= 0 ) ) && stickyHeader.classList.contains('show') ) {
						stickyHeader.classList.remove('show');
						return;
					}

					if ( st < 0 || Math.abs(lst - st) <= 5 )
						return;

					if ( st > window.lhp ) {

						if ( st == 0 && stickyHeader.classList.contains('show') ) {

							stickyHeader.classList.remove('show');

						} else if ( st <= lst && ! stickyHeader.classList.contains('show') ) {

							window.lhp = stickyHeader.offsetTop;
							stickyHeader.classList.add('show');

						} else if ( st > lst && stickyHeader.classList.contains('show') ) {
							stickyHeader.classList.remove('show');
						}

					}

					window.lst = st;

				}

				window.addEventListener('scroll', this.SCROLL_StickyHelper, {passive:true});

			}

			// drawer connections

			document.querySelectorAll('[data-js-sidebar-handle]').forEach(elm => {
				if ( elm.hasAttribute('aria-controls') ) {
					const elmSidebar = document.getElementById(elm.getAttribute('aria-controls'));
					elm.addEventListener('click', e=>{
						e.preventDefault();
						elm.setAttribute('aria-expanded', 'true');
						elmSidebar.show();
					})
					elm.addEventListener('keyup', e=>{
						if ( e.keyCode == window.KEYCODES.RETURN ) {
							elm.setAttribute('aria-expanded', 'true');
							elmSidebar.show();
							elmSidebar.querySelector('[data-js-close]').focus();
						}
					})
				}
			});
			if ( this.classList.contains('site-header--alignment-left') || this.classList.contains('site-header--style-one-row') ) {
				document.getElementById('site-search-sidebar').classList.remove('sidebar--left');
				document.getElementById('site-search-sidebar').classList.add('sidebar--right');
			}
			if ( this.classList.contains('site-header--style-one-row') && this.classList.contains('site-header--alignment-center') ) {
				document.getElementById('site-menu-sidebar').classList.remove('sidebar--right');
				document.getElementById('site-menu-sidebar').classList.add('sidebar--left');
			}

			// closing drawers

			document.querySelectorAll('sidebar-drawer [data-js-close]').forEach(elm=>{
				elm.addEventListener('click', e=>{
					e.preventDefault();
					if ( e.target.closest('.sidebar').classList.contains('sidebar--opened') ) {
						e.target.closest('.sidebar').hide();
					}
				});
			});
			document.querySelector('.site-overlay').addEventListener('click', ()=>{
				if ( document.querySelector('.sidebar--opened') ) {
					document.querySelector('.sidebar--opened').hide();
				}
			});
			document.addEventListener('keydown', e=>{
				if ( e.keyCode == window.KEYCODES.ESC ) {
					if ( document.querySelector('.sidebar--opened') ) {
						document.querySelector('.sidebar--opened').hide();
					}
				}
			});

			// resizing drawers

			const rootHeight = document.getElementById('root-height');
			this.RESIZE_SidebarHelper = debounce(()=>{
				rootHeight.innerHTML = `:root {
					--window-height: ${window.innerHeight}px;
					--window-width: ${document.body.clientWidth}px;
				}`;
			}, 200);
			window.addEventListener('resize', this.RESIZE_SidebarHelper);
			rootHeight.innerHTML = `:root {
				--window-height: ${window.innerHeight}px;
				--window-width: ${document.body.clientWidth}px;
			}`;
			document.body.classList.add('header-loaded');

			// switch menu (on load and on resize)
			this._previousWidth = window.innerWidth;
			this._checkMenuWidth();
			this._checkMenuWidth();

			window.addEventListener('resize', debounce(()=>{
				const currentWidth = window.innerWidth;
				if ( currentWidth < this._previousWidth ) {
					this._checkMenuWidth();
				}
				this._previousWidth = currentWidth;
			}, 200));

			// submenu masonry

			document.querySelectorAll('.site-nav.style--classic .submenu-masonry').forEach(elm=>{
				if ( Macy ) {
					const submenuMacy = new Macy({
						container: elm,
						columns: parseInt(elm.getAttribute('data-columns')),
						margin: 30
					});
					setTimeout(()=>{
						submenuMacy.reInit();
					}, 100);
				}
			});

			// predictive search

			if ( JSON.parse(document.getElementById('shopify-features').text).predictiveSearch ) {

				// predictive search (sidebar)

				document.querySelectorAll('[data-js-open-search-drawer').forEach(elm=>{
					elm.addEventListener('click', e=>{
						e.preventDefault();
						if ( ! document.body.classList.contains('predictive-script-loaded') ) {
							document.body.classList.add('predictive-script-loaded')
							const predictiveSearchJS = document.createElement('script');
							predictiveSearchJS.src = KROWN.settings.predictive_search_script;
							document.head.appendChild(predictiveSearchJS);
						}
						setTimeout(()=>{
							document.querySelector('#search-form-sidebar').focus();
						}, 10)
					});
				});

			} else {

				this.querySelector('search-form').addEventListener('click', e=>{
					e.preventDefault();
					window.location.href = KROWN.settings.routes.search_url;
				});

			}

			// touch menu helpers

			const closeTouchSubmenus = (focusedElm, focusedParent=null)=>{
				document.querySelectorAll('.style--classic li.focus').forEach(elm=>{
					if ( ! ( elm === focusedElm || elm === focusedParent ) ) {
						elm.classList.remove('focus');
					}
				})
			}
			let babyMenuTouch = false;
			if ( 'ontouchstart' in window || window.DocumentTouch && document instanceof DocumentTouch ) {
				document.querySelectorAll('.style--classic .has-babymenu > a').forEach(elmLink=>{
					const elm = elmLink.parentElement;
					elmLink.addEventListener('click', e=>{
						e.preventDefault();
						e.stopPropagation();
						elm.classList.toggle('focus');
						babyMenuTouch = true;
						closeTouchSubmenus(elm,elm.closest('.has-submenu'));
					})
				})
				document.querySelectorAll('.style--classic .has-submenu > a').forEach(elmLink=>{
					const elm = elmLink.parentElement;
					if ( ! elm.classList.contains('mega-link') ) {
						elmLink.addEventListener('click', e=>{
							e.preventDefault();
							e.stopPropagation();
							if ( ! babyMenuTouch ) {
								elm.classList.toggle('focus');
								closeTouchSubmenus(elm);
							}
							babyMenuTouch = false;
						})
					}
				});
			}

			// tab navigation for the menu

			document.querySelectorAll('.site-nav.style--classic .has-submenu > a').forEach(childEl=>{

				const elm = childEl.parentNode;

				elm.addEventListener('keydown', e=>{

					if ( e.keyCode == window.KEYCODES.RETURN ) {
						if ( ! e.target.classList.contains('no-focus-link') ) {
							e.preventDefault();
						}
						if ( ! elm.classList.contains('focus') ) {
							elm.classList.add('focus');
							elm.setAttribute('aria-expanded', 'true');
						} else if ( document.activeElement.parentNode.classList.contains('has-submenu') && elm.classList.contains('focus') ) {
							elm.classList.remove('focus');
							elm.setAttribute('aria-expanded', 'true');
						}
					}
				});

				if ( elm.querySelector('.submenu-holder > li:last-child a') ) {
					elm.querySelector('.submenu-holder > li:last-child a').addEventListener('focusout', e=>{
						if ( elm.classList.contains('focus') ) {
							elm.classList.remove('focus');
							elm.setAttribute('aria-expanded', 'false');
						}
					});
				}

			});

			document.querySelectorAll('.site-nav.style--classic .has-babymenu:not(.mega-link) > a').forEach(childEl=>{

				const elm = childEl.parentNode;

				elm.addEventListener('keydown', e=>{
					if ( e.keyCode == window.KEYCODES.RETURN ) {
						if ( ! e.target.classList.contains('no-focus-link') ) {
							e.preventDefault();
						}
						if ( ! elm.classList.contains('focus') ) {
							elm.classList.add('focus');
							elm.setAttribute('aria-expanded', 'true');
						} else {
							elm.classList.remove('focus');
							elm.setAttribute('aria-expanded', 'false');
						}
					}
				});

				if ( elm.querySelector('.babymenu li:last-child a') ) {
					elm.querySelector('.babymenu li:last-child a').addEventListener('focusout', e=>{
						if ( elm.parentNode.classList.contains('focus') ) {
							elm.parentNode.classList.remove('focus');
							elm.parentNode.setAttribute('aria-expanded', 'false');
						}
					});
				}

			})

		}

		unmount(){
			window.removeEventListener('resize', this.RESIZE_SidebarHelper);
			window.removeEventListener('scroll', this.SCROLL_StickyHelper);
			document.querySelector('.sticky-header')?.remove();
		}

		_checkMenuWidth() {

			const header = document.querySelector('.site-header--menu-classic');
			if ( !header ) {
				return;
			}

			const classicMenu = header.querySelector('.area--menu-classic');
			if ( !classicMenu ) {
				return;
			}

			const logo = header.querySelector('.area--logo');
			const logoIsCentered = header.classList.contains('header__top--logo-center');
			let availWidthforClassicMenu = 0;

			const headerStyle = window.getComputedStyle(header);
			const headerPaddingRight = parseFloat(headerStyle.getPropertyValue('padding-right'));
		  const headerPaddingLeft = parseFloat(headerStyle.getPropertyValue('padding-left'));
		  const headerRowGap = 10;

			const headerWidth = header.offsetWidth - headerPaddingLeft - headerPaddingRight;
			const logoWidth = logo.offsetWidth;
			const classicMenuWidth = classicMenu.offsetWidth + headerRowGap;

			const headerItems = header.children;

			// Calculate the total width of the child elements
			let totalWidthOfHeaderItems = 0;
			for (let i = 0; i < headerItems.length; i++) {
				if(headerItems[i].offsetWidth > 0) {
					totalWidthOfHeaderItems += headerItems[i].offsetWidth + headerRowGap;
				}
			}

			totalWidthOfHeaderItems -= headerRowGap; // grid gap for one element (gap is inner space :) )

			if( logoIsCentered ) {
				availWidthforClassicMenu = headerWidth / 2 - logoWidth / 2 - headerRowGap; // consider the gap
			} else {
				let otherElementsWidth = totalWidthOfHeaderItems - logoWidth - classicMenuWidth;
				availWidthforClassicMenu = headerWidth - otherElementsWidth - logoWidth;
			}

			// If no available space for classic menu, convert menu to minimal
			if ( classicMenuWidth > availWidthforClassicMenu ) {
				header.classList.remove('site-header--menu-classic');
				header.classList.add('site-header--menu-minimal');
				classicMenu.remove();
			}
		}

		_adjustNavLayout() {
			if ( this.querySelector('.site-nav') && this.querySelector('.site-nav').classList.contains('style--classic') ) {

				if ( this.querySelector('nav > ul').scrollWidth > this.querySelector('nav').offsetWidth ) {
					this.classList.add('site-header--swap-menu-style');
					document.body.classList.remove('header--has-two-rows');
					let header = document.getElementById('site-header');
					let twoRowsDetected = header.querySelectorAll('[class*="two-rows"]');
					twoRowsDetected.forEach(el=>{
						el.className = el.className.replace('two-rows', 'one-row');
					});
				}
			}
		}

	}

  if ( typeof customElements.get('main-header') == 'undefined' ) {
		customElements.define('main-header', MainHeader);
	}

}

if ( typeof SidebarDrawer !== 'function' ) {

	class SidebarDrawer extends HTMLElement {

		constructor(){
			super();
			this.querySelector('[data-js-close]').addEventListener('click', ()=>{
				this.hide();
			});
			document.addEventListener('keydown', e=>{
				if ( e.keyCode == window.KEYCODES.ESC ) {
					const openedSidebar = document.querySelector('sidebar-drawer.sidebar--opened');
					if ( openedSidebar ){
						openedSidebar.hide();
					}
				}
			});
		}

		/*
			* generic hide/show functions
		*/

		show(){

			this._opened = true;
			document.body.classList.add('sidebar-opened');
			if ( this.classList.contains('sidebar--right') ) {
				document.body.classList.add('sidebar-opened--right');
			} else if ( this.classList.contains('sidebar--left') ) {
				document.body.classList.add('sidebar-opened--left');
			}
			if ( this.id == 'site-cart-sidebar' && document.getElementById('cart-recommendations-sidebar') ) {
				setTimeout(()=>{
					document.querySelector('#cart-recommendations-sidebar css-slider')?.resetSlider();
				}, 10);
			}
			this.style.display = 'flex';
			setTimeout(()=>{
				this.classList.add('sidebar--opened');
				window.inertElems.forEach(elm=>{
					elm.setAttribute('inert', '');
				})
			}, 15);

		}

		hide(){

			this._opened = false;
			this.classList.remove('sidebar--opened');

			document.body.classList.remove('sidebar-opened');
			document.body.classList.remove('sidebar-opened--left');
			document.body.classList.remove('sidebar-opened--right');
			window.inertElems.forEach(elm=>{
				elm.removeAttribute('inert');
			})

			document.querySelector(`[aria-controls="${this.id}"]`)?.setAttribute('aria-expanded', 'false');

			setTimeout(()=>{
				this.style.display = 'none';
			}, 501);

		}

	}


  if ( typeof customElements.get('sidebar-drawer') == 'undefined' ) {
		customElements.define('sidebar-drawer', SidebarDrawer);
	}

}

if ( typeof MobileNavigation !== 'function' ) {

	class MobileNavigation extends HTMLElement {

		constructor() {

			super();

			this._openedFirstSubmenu = false;
			this._openedSecondSubmenu = false;

			this.querySelectorAll('.has-submenu > a').forEach(elm=>{
				elm.addEventListener('click', e=>{
					e.preventDefault();
					if ( ! this._openedFirstSubmenu ) {
						this._openedFirstSubmenu = true;
						this.classList.add('opened-first-submenu')
						this.closest('sidebar-drawer').scrollTo({top: 0});
					}
					e.target.closest('li').classList.add('opened');
					this._resizeContainer();
				})
			});

			this.querySelectorAll('.has-babymenu > a').forEach(elm=>{
				elm.addEventListener('click', e=>{
					e.preventDefault();
					if ( ! this._openedSecondSubmenu ) {
						this._openedSecondSubmenu = true;
						this.classList.add('opened-second-submenu')
						this.closest('sidebar-drawer').scrollTo({top: 0});
					}
					e.target.closest('li').classList.add('opened');
					this._resizeContainer();
				})
			});

			this.querySelectorAll('.submenu-back a').forEach(elm=>{
				elm.addEventListener('click', e=>{
					if ( this._openedSecondSubmenu ) {
						this._openedSecondSubmenu = false;
						this.classList.remove('opened-second-submenu');
						this._resizeContainer();
					} else if ( this._openedFirstSubmenu ) {
						this._openedFirstSubmenu = false;
						this.classList.remove('opened-first-submenu');
						this._resizeContainer(true);
					}
					this.closest('sidebar-drawer').scrollTo({top: 0});
					setTimeout(()=>{
						e.target.closest('li.opened').classList.remove('opened');
					}, 301);
					e.preventDefault();
				})
			});

		}

		_resizeContainer(main=false){
			if ( main ) {
				this.style.height = `auto`;
			} else {
				if ( this._openedSecondSubmenu ) {
					this.style.height = `${this.querySelector('.has-babymenu.opened .babymenu').scrollHeight}px`;
				} else if ( this._openedFirstSubmenu ) {
					this.style.height = `${this.querySelector('.has-submenu.opened .submenu').scrollHeight}px`;
				}
			}
		}

	}

  if ( typeof customElements.get('mobile-navigation') == 'undefined' ) {
		customElements.define('mobile-navigation', MobileNavigation);
	}

}