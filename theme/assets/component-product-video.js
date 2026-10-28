class ProductVideo extends HTMLElement {
  constructor() {
    super();
    this.videoPlayer = this.querySelector("video");
    this.playButton = this.querySelector(".custom-play-button");
    this.videoId = this.getAttribute("data-video-id");
  }

  connectedCallback() {
    this.playButton.addEventListener("click", () => this.toggleVideoPlayback());
    this.videoPlayer.addEventListener("click", () => this.handleVideoClick());
    this.videoPlayer.addEventListener("ended", () => this.showPlayButton());
  }

  toggleVideoPlayback() {
    if (this.videoPlayer.paused) {
      this.videoPlayer.muted = false;
      this.videoPlayer.play();
      this.hidePlayButton();
    } else {
      this.videoPlayer.pause();
      this.showPlayButton();
    }
  }

  handleVideoClick() {
    if (this.videoPlayer.paused) {
      this.videoPlayer.muted = false;
      this.videoPlayer.play();
      this.hidePlayButton();
      this.createPopUpVideoSlider();
    } else {
      this.videoPlayer.pause();
      this.showPlayButton();
    }
  }

  showPlayButton() {
    this.playButton.style.display = "block";
  }

  hidePlayButton() {
    this.playButton.style.display = "none";
  }

  createPopUpVideoSlider() {
    const popUpVideoWrapper = this.createPopUpWrapper();
    const swiperContainer = this.createSwiperContainer();
    const swiperWrapper = document.createElement("div");
    swiperWrapper.classList.add("swiper-wrapper");

    const videos = Array.from(document.querySelectorAll("product-video"));
    const initSlide = videos.findIndex(video => video.getAttribute("data-video-id") === this.videoId);

    videos.forEach(video => swiperWrapper.appendChild(this.createVideoSlide(video)));

    const swiperNavigation = document.createElement("div");
    swiperNavigation.classList.add("swiper-navigation");
    swiperNavigation.innerHTML = `<button class="swiper-button-prev">
        <svg xmlns="http://www.w3.org/2000/svg" width="8" height="13" viewBox="0 0 8 13" fill="none">
          <path d="M0.836975 1.47037L5.71621 6.47579L0.836976 11.4812C0.749617 11.5706 0.700708 11.6907 0.700708 11.8157C0.700708 11.9407 0.749617 12.0608 0.836976 12.1502C0.879403 12.1935 0.930044 12.2279 0.985933 12.2514C1.04182 12.2749 1.10184 12.287 1.16246 12.287C1.22308 12.287 1.28309 12.2749 1.33898 12.2514C1.39487 12.2279 1.44551 12.1935 1.48794 12.1502L6.67964 6.82531C6.77079 6.7318 6.8218 6.60638 6.8218 6.47579C6.8218 6.3452 6.77079 6.21978 6.67964 6.12627L1.48894 0.801376C1.44648 0.757769 1.39572 0.723108 1.33964 0.699442C1.28357 0.675776 1.22332 0.663583 1.16246 0.663583C1.10159 0.663583 1.04135 0.675776 0.985272 0.699442C0.929197 0.723108 0.878433 0.757769 0.835974 0.801376C0.748614 0.890803 0.699707 1.01086 0.699707 1.13587C0.699707 1.26089 0.748614 1.38094 0.835974 1.47037L0.836975 1.47037Z" fill="white" stroke="white" stroke-width="1.03623"/>
        </svg>
      </button>
      <button class="swiper-button-next">
        <svg xmlns="http://www.w3.org/2000/svg" width="8" height="13" viewBox="0 0 8 13" fill="none">
          <path d="M0.836975 1.47037L5.71621 6.47579L0.836976 11.4812C0.749617 11.5706 0.700708 11.6907 0.700708 11.8157C0.700708 11.9407 0.749617 12.0608 0.836976 12.1502C0.879403 12.1935 0.930044 12.2279 0.985933 12.2514C1.04182 12.2749 1.10184 12.287 1.16246 12.287C1.22308 12.287 1.28309 12.2749 1.33898 12.2514C1.39487 12.2279 1.44551 12.1935 1.48794 12.1502L6.67964 6.82531C6.77079 6.7318 6.8218 6.60638 6.8218 6.47579C6.8218 6.3452 6.77079 6.21978 6.67964 6.12627L1.48894 0.801376C1.44648 0.757769 1.39572 0.723108 1.33964 0.699442C1.28357 0.675776 1.22332 0.663583 1.16246 0.663583C1.10159 0.663583 1.04135 0.675776 0.985272 0.699442C0.929197 0.723108 0.878433 0.757769 0.835974 0.801376C0.748614 0.890803 0.699707 1.01086 0.699707 1.13587C0.699707 1.26089 0.748614 1.38094 0.835974 1.47037L0.836975 1.47037Z" fill="white" stroke="white" stroke-width="1.03623"/>
        </svg>
      </button>`;
    swiperContainer.appendChild(swiperWrapper);
    swiperContainer.appendChild(swiperNavigation);
    popUpVideoWrapper.appendChild(swiperContainer);
    document.body.appendChild(popUpVideoWrapper);
    document.body.style.overflow = "hidden";

    new Swiper(swiperContainer, {
      slidesPerView: 1,
      spaceBetween: 10,
      initialSlide: initSlide,
      centeredSlides: true,
      navigation: {
        nextEl: ".swiper-button-next",
        prevEl: ".swiper-button-prev",
      },
    });
  }

  createPopUpWrapper() {
    const wrapper = document.createElement("div");
    wrapper.classList.add("popup-video-wrapper");
    return wrapper;
  }

  createSwiperContainer() {
    const container = document.createElement("div");
    container.classList.add("swiper");
    container.id = "popUpVideoSlider";
    return container;
  }

  createVideoSlide(video) {
    const videoContent = video.innerHTML;
    const videoId = video.getAttribute("data-video-id");
    const videoWrapper = document.createElement("div");
    videoWrapper.classList.add("swiper-slide");

    const videoOuterWrapper = document.createElement("div");
    videoOuterWrapper.classList.add("video-outer-wrapper");
    videoOuterWrapper.setAttribute("data-video-id", videoId);
    videoOuterWrapper.innerHTML = videoContent + '<button class="video-close-button">X</button>';

    const popUpVideo = videoOuterWrapper.querySelector("video");
    this.updateVideoClass(popUpVideo);
    if (videoId === this.videoId) {
      this.videoPlayer.muted = true;
      this.videoPlayer.currentTime = 0;
      popUpVideo.play();
    };
    this.attachEventListeners(videoOuterWrapper, popUpVideo, videoId);

    videoWrapper.appendChild(videoOuterWrapper);
    return videoWrapper;
  }

  updateVideoClass(video) {
    if (video.classList.contains("custom-video-player")) {
      video.classList.replace("custom-video-player", "custom-video-player-popup");
    }
  }

  attachEventListeners(wrapper, video, videoId) {
    const playButton = wrapper.querySelector(".custom-play-button");
    playButton.addEventListener("click", () => this.togglePopUpPlayback(video, playButton, videoId));
    video.addEventListener("click", () => this.togglePopUpPlayback(video, playButton, videoId));
    video.addEventListener("pause", () => this.pauseCorrespondingOriginalVideo(videoId));
    wrapper.querySelector(".video-close-button").addEventListener("click", () => this.closePopUp(videoId));
  }

  togglePopUpPlayback(video, playButton, videoId) {
    if (video.paused) {
      video.play();
      playButton.style.display = "none";
      this.playCorrespondingOriginalVideo(videoId);
    } else {
      video.pause();
      playButton.style.display = "block";
      this.pauseCorrespondingOriginalVideo(videoId);
    }
  }

  playCorrespondingOriginalVideo(videoId) {
    const originalVideo = document.querySelector(`product-video[data-video-id="${videoId}"] video`);
    const originalVideoPlayButton = document.querySelector(`product-video[data-video-id="${videoId}"] .custom-play-button`);
    if (originalVideo) {
      originalVideo.muted = true;
      originalVideo.play();
      originalVideoPlayButton.style.display = "none";
    }
  }

  pauseCorrespondingOriginalVideo(videoId) {
    const originalVideo = document.querySelector(`product-video[data-video-id="${videoId}"] video`);
    const originalVideoPlayButton = document.querySelector(`product-video[data-video-id="${videoId}"] .custom-play-button`);
    if (originalVideo) {
      originalVideo.pause();
      originalVideoPlayButton.style.display = "block";
    }
  }

  closePopUp(videoId) {
    document.body.style.overflow = "auto";
    document.querySelector(".popup-video-wrapper").remove();
    this.pauseCorrespondingOriginalVideo(videoId);
    this.playButton.style.display = "block";
  }
}

if (!customElements.get("product-video")) {
  customElements.define("product-video", ProductVideo);
}
