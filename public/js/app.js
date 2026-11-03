/**
 * 前台渐进增强脚本：无刷新翻页、点赞 / 关注、评论提交。
 * 所有交互都基于现有表单与链接，脚本加载失败时页面仍按普通请求工作。
 */
(function () {
  'use strict';

  var doc = document;

  function toast(text, type) {
    if (!text) return;
    var el = doc.createElement('div');
    el.className = 'wb-ajax-toast' + (type === 'err' ? ' err' : '');
    el.textContent = text;
    doc.body.appendChild(el);
    setTimeout(function () {
      el.classList.add('out');
      setTimeout(function () {
        el.remove();
      }, 300);
    }, 2600);
  }

  function send(url, body) {
    return fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
      body: body,
    }).then(function (res) {
      return res.json().catch(function () {
        return { ok: false, message: '请求失败，请稍后重试' };
      });
    });
  }

  /* ---------------- 信息流无刷新翻页 ---------------- */

  doc.addEventListener('click', function (ev) {
    var link = ev.target.closest ? ev.target.closest('a') : null;
    if (!link) return;
    var block = link.closest('[data-feed]');
    if (!block || !link.closest('.wb-pager')) return;

    var target = new URL(link.href, location.href);
    var page = target.searchParams.get('p');
    if (!page || block.dataset.loading) return;
    ev.preventDefault();

    var endpoint = block.getAttribute('data-feed');
    if (!endpoint) return;
    block.dataset.loading = '1';
    block.classList.add('is-loading');

    fetch(endpoint + 'p=' + encodeURIComponent(page), {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    })
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        if (!data || !data.ok) throw new Error((data && data.message) || '加载失败');
        block.querySelector('.wb-feed').innerHTML = data.html;
        var pagerEl = block.querySelector('.wb-pager');
        if (data.pager) {
          if (pagerEl) pagerEl.outerHTML = data.pager;
          else block.insertAdjacentHTML('beforeend', data.pager);
        } else if (pagerEl) {
          pagerEl.remove();
        }
        history.pushState({ feed: page }, '', link.href);
        block.scrollIntoView({ behavior: 'smooth', block: 'start' });
      })
      .catch(function (err) {
        toast(err.message || '加载失败，请稍后重试', 'err');
      })
      .finally(function () {
        delete block.dataset.loading;
        block.classList.remove('is-loading');
      });
  });

  window.addEventListener('popstate', function () {
    // 返回时页码与侧栏都可能变化，整页刷新最稳妥；页面本身有缓存，重载成本可控
    location.reload();
  });

  /* ---------------- 点赞 / 关注 / 评论 ---------------- */

  doc.addEventListener('submit', function (ev) {
    var form = ev.target;
    var action = form.getAttribute('action');
    if (action === '/like') return toggleLike(form, ev);
    if (action === '/follow') return toggleFollow(form, ev);
    if (action === '/comment') return submitComment(form, ev);
  });

  function toggleLike(form, ev) {
    ev.preventDefault();
    var input = form.querySelector('[name="pid"]');
    var button = form.querySelector('button');
    if (!input || !button || button.disabled) return;
    button.disabled = true;
    send('/api/like', new URLSearchParams({ pid: input.value }))
      .then(function (data) {
        if (!data.ok) {
          toast(data.message || '点赞失败', 'err');
          if (data.login) location.href = '/login.html?err=' + encodeURIComponent(data.message || '请先登录后再点赞');
          return;
        }
        button.classList.toggle('on', !!data.liked);
        button.textContent = '👍 ' + (data.liked ? '已赞' : '赞') + ' ' + data.count;
      })
      .catch(function () {
        toast('点赞失败，请稍后重试', 'err');
      })
      .finally(function () {
        button.disabled = false;
      });
  }

  function toggleFollow(form, ev) {
    ev.preventDefault();
    var input = form.querySelector('[name="target_id"]');
    var button = form.querySelector('button');
    if (!input || !button || button.disabled) return;
    button.disabled = true;
    send('/api/follow', new URLSearchParams({ target_id: input.value }))
      .then(function (data) {
        if (!data.ok) {
          toast(data.message || '关注失败', 'err');
          if (data.login) location.href = '/login.html?err=' + encodeURIComponent(data.message || '请先登录后再关注');
          return;
        }
        button.classList.toggle('on', !!data.following);
        button.textContent = data.following ? '已关注' : '+ 关注';
      })
      .catch(function () {
        toast('关注失败，请稍后重试', 'err');
      })
      .finally(function () {
        button.disabled = false;
      });
  }

  function submitComment(form, ev) {
    ev.preventDefault();
    var card = form.closest('.wb-article') || form.parentElement;
    var list = card && card.querySelector('[data-comment-list]');
    var countEl = card && card.querySelector('[data-comment-count]');
    var body = new URLSearchParams();
    new FormData(form).forEach(function (value, key) {
      body.append(key, value);
    });
    if (countEl) body.set('count', countEl.textContent.trim());

    var button = form.querySelector('button[type="submit"]');
    if (button) button.disabled = true;
    send('/api/comment', body)
      .then(function (data) {
        if (!data.ok) {
          toast(data.message || '评论失败', 'err');
          return;
        }
        if (data.html && list) {
          var empty = list.querySelector('[data-comment-empty]');
          if (empty) empty.remove();
          list.insertAdjacentHTML('beforeend', data.html);
          if (countEl) countEl.textContent = String((parseInt(countEl.textContent, 10) || 0) + 1);
        }
        // 只清空评论正文，保留游客已填的昵称 / 邮箱 / 主页，便于连续评论
        var textarea = form.querySelector('textarea');
        if (textarea) textarea.value = '';
        toast(data.message || '评论已发布');
      })
      .catch(function () {
        toast('评论失败，请稍后重试', 'err');
      })
      .finally(function () {
        if (button) button.disabled = false;
      });
  }
})();
