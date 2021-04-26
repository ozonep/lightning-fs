function debounce(fn, wait) {
  var timeout;
  return function () {
    if (!wait) {
      return fn.apply(this, arguments);
    }
    var context = this;
    var args = arguments;
    var callNow = !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(function () {
      timeout = null;
      if (!callNow) {
        return fn.apply(context, args);
      }
    }, wait);
    if (callNow) {
      return fn.apply(this, arguments);
    }
  };
}

function once(fn) {
  var called, value;

  if (typeof fn !== "function") {
    throw new Error("expected a function but got " + fn);
  }

  return function wrap() {
    if (called) {
      return value;
    }
    called = true;
    value = fn.apply(this, arguments);
    fn = undefined;
    return value;
  };
}

module.exports = {
  debounce,
  once,
};
