window.basicLightbox = {

  // "private"

  _toElement: function(html, children = false) {
    const elem = document.createElement('div')
    elem.innerHTML = html.trim()
    return children === true ? elem.children : elem.firstChild
  },
  
  _validateOptions: function(opts = {}) {

    opts = Object.assign({}, opts)
  
    if (opts.closable == null) opts.closable = true
    if (opts.className == null) opts.className = ''
    if (opts.onShow == null) opts.onShow = () => {}
    if (opts.onClose == null) opts.onClose = () => {}
    if (opts.trigger == null) opts.trigger = false
    if (opts.focus == null) opts.focus = false
  
    return opts
  
  },

  _validateContent: function(content) {

    const isString = typeof content === 'string'
    const isHTMLElement = content instanceof HTMLElement === true
  
    if (isString === false && isHTMLElement === false) {
      throw new Error('Content must be a DOM element/node or string')
    }
  
    if (isString === true) {
      // String
      return Array.from(this._toElement(content, true))
    } else if (content.tagName === 'TEMPLATE') {
      // Template
      return [ content.content.cloneNode(true) ]
    } else {
      // HTMLElement
      return Array.from(content.children)
    }
  
  },

  _containsTag: function(elem, tag) {
    const children = elem.children
    return (children.length === 1 && children[0].tagName === tag)
  },

  _render: function(content, opts) {

    const elem = this._toElement(`
      <div class="basicLightbox ${ opts.className }">
        <div class="basicLightbox__placeholder" role="dialog"></div>
      </div>
    `)
    const placeholder = elem.querySelector('.basicLightbox__placeholder')
  
    content.forEach((child) => placeholder.appendChild(child))
  
    const img = this._containsTag(placeholder, 'IMG')
    const video = this._containsTag(placeholder, 'VIDEO')
    const iframe = this._containsTag(placeholder, 'IFRAME')
  
    if (img === true) elem.classList.add('basicLightbox--img')
    if (video === true) elem.classList.add('basicLightbox--video')
    if (iframe === true) elem.classList.add('basicLightbox--iframe')
  
    return elem
  
  },
  
  _show: function(elem, next) {

    document.body.appendChild(elem)
  
    setTimeout(() => {
      requestAnimationFrame(() => {
        elem.classList.add('basicLightbox--visible')
        return next()
      })
    }, 10)
  
    return true
  
  },

  _close: function(elem, next) {
    elem.classList.remove('basicLightbox--visible')
  
    setTimeout(() => {
      if (this._visible(elem) === false) return next()
      elem.parentElement.removeChild(elem)
      return next()
    }, 410)
  
    return true
  
  },
  
  _visible: function(elem) {
    elem = elem || document.querySelector('.basicLightbox')
    return (elem != null && elem.ownerDocument.body.contains(elem) === true)
  },

  // "public"

  create: function(content, opts) {

  	content = this._validateContent(content)
    opts = this._validateOptions(opts)
  
    const elem = this._render(content, opts)
  
    const _element = () => {
      return elem
    }
  
    const _visible = () => {
      return this._visible(elem)
    }
  
    const _show = (next, focus) => {
      if (opts.onShow(instance) === false) return false
  
      return this._show(elem, () => {
        if (typeof focus === 'string' ) {
         if ( elem.querySelectorAll(focus) ) {
          elem.querySelectorAll(focus)[0].focus();
         }
        }
        if (typeof next === 'function') return next(instance)
      })
  
    }
  
    const _close = (next) => {
  
      if (opts.onClose(instance) === false) return false
  
      return this._close(elem, () => {
        if (typeof next === 'function') return next(instance)
      })
  
    }
  
    if (opts.closable === true) {
      elem.addEventListener('click', (e) => {
        if (e.target !== elem) return
        _close()
      })
      window.addEventListener('keydown', (e) => {
        if ( e.keyCode == 27 ) _close()
      })
      if ( elem.querySelector('.basicLightboxClose') ) {
        elem.querySelector('.basicLightboxClose').addEventListener('click', (e) => {
          e.preventDefault();
          _close();
        })
        elem.querySelector('.basicLightboxClose').addEventListener('keydown', (e) => {
          if ( e.keyCode == 13 ) _close();
        })
      }
    } 

    if (opts.trigger) {
      opts.trigger.addEventListener('click', (e) => {
        e.preventDefault();
        _show(null, opts.focus);
      })
      opts.trigger.addEventListener('keydown', (e) => {
        if ( e.keyCode == 13 ) {
          _show(null, opts.focus)
        }
      })
    }
  
    // Assign instance to a variable so the instance can be used
    // elsewhere in the current function.
    const instance = {
      element: _element,
      visible: _visible,
      show: _show,
      close: _close
    }
  
    return instance
  
  }

};