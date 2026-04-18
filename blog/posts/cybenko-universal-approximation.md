---
title: "왜 신경망은 모든 함수를 근사할 수 있을까?"
date: "2026-04-14"
category: "Deep Learning Theory"
tags: ["Universal Approximation", "Cybenko", "Neural Networks", "Functional Analysis"]
---

# 왜 뉴럴 네트워크는 모든 함수를 근사할 수 있을까?

가장 단순한 구조의 신경망을 생각해보자. 입력층, 은닉층 하나, 출력층. 활성화 함수는 시그모이드. 이 네트워크의 출력은 다음과 같다.

$$f_\theta(x) = \sum_{i=1}^{N} u_i \, \sigma(a_i^\top x + b_i)$$

각 항은 시그모이드 함수를 한 번 통과한 값에 가중치를 곱한 것에 불과하다. 이런 단순한 조합이 어떻게 **임의의 연속함수**를 정확하게 근사할 수 있는가?

1989년, George Cybenko의 연구에 따르면 신경망 은닉층의 뉴런 수($N$)를 충분히 크게 하면, 컴팩트 집합[^1] 위의 어떤 연속함수든 균등하게(sup-norm) 근사할 수 있다. 이것이 **Universal Approximation Theorem**이다.

[^1]: 컴팩트 집합(Compact Set)이란 직관적으로 "닫혀있고 유계인" 집합을 말합니다. 예를 들어 $[0, 1]$ 이나 $[-3, 3]$ 같은 닫힌 구간은 컴팩트 하지만 $(0, 1)$ 같은 열린 구간이거나 $\mathbb{R}$ 같은 정의역은 컴팩트하지 않습니다. 함수 근사 정리에서 해당 조건이 필요한 이유는, 정의역이 무한하면 유한한 뉴런의 개수로는 모든 곳을 커버하는 것이 불가능해 근사가 불가능하기 때문입니다.

> 다만 해당 정리는 존재성 정리로 $N$이 구체적으로 얼마나 필요한지, 또 학습 알고리즘이 그 파라미터를 찾을 수 있는지는 별개의 문제다.

수학적 증명 대신 핵심 개념만 직관적으로 이해해보자.

## 엄마, 저(시그모이드)는 커서 계단함수가 될래요

시그모이드 함수 $\sigma(x) = \frac{1}{(1+e^{-x})}$는 부드러운 곡선을 갖는 함수다. 이러한 함수의 입력을 $\delta$로 나누고, $\sigma(x/\delta)$에서 $\delta$를 0에 가깝게 줄이면 곡선이 점점 뾰족해지고 <strong>계단함수(step function)</strong>에 수렴하게된다.

<div class="fig-interactive">
  <div id="fig1" class="fig-plot"></div>
  <div class="fig-controls">
    <div class="fig-control">
      <label>δ</label>
      <input type="range" id="s1-delta" min="0.02" max="2" step="0.02" value="1.0">
      <span class="fig-val" id="s1-delta-val">1.00</span>
    </div>
  </div>
  <div class="fig-caption"><strong>Figure 1.</strong> δ를 줄이면 σ(x/δ)가 step function에 수렴한다. 슬라이더를 드래그해보세요.</div>
</div>

시그모이드를 충분히 압축하게되면 특정 지점에서 0에서 1로 점프하는 **스위치**가 된다. 이 스위치는 "여기부터 시작임!"이라는 특정 상태를 결정하는 함수 $\mathbf{1}_{[c,\,\infty)}$ 역할을 한다.

## 얼마나 방지턱이 되고 싶은지 감도 안옴

스위치 하나가 "여기부터 시작임!"을 의미한다면, 두 개로는 "여기서부터 여기까지 시작과 끝임!"을 만들 수 있다.

$$\sigma\!\left(\frac{x - t_0}{\delta}\right) - \sigma\!\left(\frac{x - t_1}{\delta}\right) \;\approx\; \mathbf{1}_{[t_0,\, t_1]}(x)$$

위 식은 구간 $[t_0, t_1]$에서만 값이 1이고 나머지는 0인 범프(bump)다[^2]. 뉴런 두 개가 모여서 **하나의 블록**[^3]을 만드는 셈이다.

[^2]: 실제로 bump는 수학(해석학)에서 쓰이는 용어입니다. 특정 구간에서만 값이 존재하고 나머지에서는 0인 함수를 bump function이라고 합니다.
[^3]: 직관적인 이해를 위해 표현이 모호해졌지만, 블록은 결국에 구간을 의미합니다.

<div class="fig-interactive">
  <div id="fig2" class="fig-plot"></div>
  <div class="fig-controls">
    <div class="fig-control">
      <label>t₀</label>
      <input type="range" id="s2-t0" min="-4" max="1" step="0.1" value="-1">
      <span class="fig-val" id="s2-t0-val">-1.0</span>
    </div>
    <div class="fig-control">
      <label>t₁</label>
      <input type="range" id="s2-t1" min="0" max="4" step="0.1" value="2">
      <span class="fig-val" id="s2-t1-val">2.0</span>
    </div>
    <div class="fig-control">
      <label>height</label>
      <input type="range" id="s2-h" min="0.2" max="2.5" step="0.1" value="1.0">
      <span class="fig-val" id="s2-h-val">1.0</span>
    </div>
  </div>
  <div class="fig-caption"><strong>Figure 2.</strong> 시그모이드 두 개의 차이가 구간 지시함수(범프)를 근사한다. 범프의 위치와 높이를 바꿔보세요.</div>
</div>

## 범프 can be 함수

근사하고 싶은 연속함수 $f$가 있으면, 정의역을 잘게 쪼개서 각 구간에서 함수값의 중간값(평균) 높이를 가진 블록으로 표현한다[^4]. 그리고 각 블록은 방금 만든 범프 하나에 대응된다.

고등학교 수학 시간에 배운 구분구적법과 비슷하다. 구간을 잘개 나눌수록(뉴런 수 $N$이 클수록) 곡면의 윤곽이 더 정밀해진다.

[^4]: 연속함수는 구간 내의 모든 정의역에서 함수값이 정의되어야 하기 때문에 각 구간의 시작점과 끝점의 평균은 중간값을 의미합니다.

<div class="fig-interactive">
  <div id="fig3" class="fig-plot"></div>
  <div class="fig-controls">
    <div class="fig-control">
      <label>Neurons N</label>
      <input type="range" id="s3-n" min="2" max="40" step="1" value="4">
      <span class="fig-val" id="s3-n-val">4</span>
    </div>
  </div>
  <div class="fig-caption"><strong>Figure 3.</strong> 뉴런 수를 늘리면 파란색 근사가 빨간색 목표함수에 점점 가까워진다. 오차(회색 점선)도 함께 줄어든다.</div>
</div>

> **이것이 Universal Approximation을 관통하는 개념이다.** 시그모이드 → 스위치 → 블록 → 블록을 쌓아서 임의의 함수를 근사. $N$이 커질수록 오차는 점점 줄어든다.

## 뉴런 한 칼에 세상이 반 토막

1차원에서는 구간으로 쪼갰지만, 입력이 2차원 이상이면 조금 복잡해진다. $\sigma(a^\top x + b)$에서 $a^\top x + b = 0$은 하나의 <strong>초평면(hyperplane)</strong>이고, 그 한쪽은 1, 반대쪽은 0이 된다[^5]. 즉 하나의 뉴런은 공간을 반으로 토막낸다.

[^5]: 좌표축 위에 직선을 하나 생각해봅시다. 예를 들어 $x_{1} + x_{2} = 0$ 이라는 직선이 있으면, 이 직선이 평면을 두 영역으로 나눕니다.(직선의 한쪽: $x_{1}+x_{2}>0$ -> 시그모이드에 양수 들어감 -> 출력 $\approx 1$, 반대쪽 -> 시그모이드에 음수 들어감 -> 출력 $\approx 0$) 1차원에서는 점 하나가 수직선을 왼쪽(0), 오른쪽(1)로 나눈 것과 동일한 원리입니다. 2차원에서는 점 대신 직선이 그 역할을 하는 것이고, 3차원이면 평면, 그 이상이면 초평면이라고 부릅니다.

여러 뉴런이 서로 다른 방향과 위치에서 공간을 자르면 다각형 영역을 만들 수 있고, 각 영역에 다른 높이를 부여하면 2차원 함수를 근사할 수 있게된다. 

<div class="fig-interactive">
  <div id="fig4" class="fig-plot" style="min-height:420px;"></div>
  <div class="fig-controls">
    <div class="fig-control">
      <label>θ</label>
      <input type="range" id="s4-angle" min="0" max="360" step="5" value="45">
      <span class="fig-val" id="s4-angle-val">45°</span>
    </div>
    <div class="fig-control">
      <label>bias</label>
      <input type="range" id="s4-bias" min="-3" max="3" step="0.1" value="0">
      <span class="fig-val" id="s4-bias-val">0.0</span>
    </div>
    <div class="fig-control">
      <label>sharpness</label>
      <input type="range" id="s4-sharp" min="0.5" max="10" step="0.5" value="2">
      <span class="fig-val" id="s4-sharp-val">2.0</span>
    </div>
  </div>
  <div class="fig-caption"><strong>Figure 4.</strong> 단일 뉴런 σ(a₁x₁ + a₂x₂ + b)의 출력 surface. 방향(θ)과 위치(bias), 날카로움을 조절해보세요. 드래그로 3D 회전도 가능합니다.</div>
</div>

실제로 여러 뉴런을 조합하면 2차원 함수도 근사할 수 있다. 아래는 6개의 뉴런으로 목표 함수(빨간 면)를 근사한 결과(파란 면)다.

<div class="fig-interactive">
  <div id="fig5-2d" class="fig-plot" style="min-height:420px;"></div>
  <div class="fig-caption"><strong>Figure 5.</strong> 6개 뉴런으로 2D 함수를 근사한 모습. 빨간 면 = 목표, 파란 면 = NN 근사. 드래그하여 회전할 수 있습니다.</div>
</div>

위 그림을 좀 더 직관적으로 이해하기 위해 2차원상에서 근사 과정을 살펴보면 아래와 같다.

<div class="fig-interactive">
  <div style="display:flex; gap:12px; justify-content:center; align-items:flex-start; flex-wrap:wrap;">
    <div style="text-align:center;">
      <div style="font-size:12px; color:#888; margin-bottom:4px;">목표 함수 f(x₁, x₂)</div>
      <canvas id="fig6a-target" width="240" height="240" style="border:1px solid #e0e0e0; border-radius:6px;"></canvas>
    </div>
    <div style="text-align:center;">
      <div style="font-size:12px; color:#888; margin-bottom:4px;">격자 근사 (N×N)</div>
      <canvas id="fig6a-approx" width="240" height="240" style="border:1px solid #e0e0e0; border-radius:6px;"></canvas>
    </div>
  </div>
  <div class="fig-controls">
    <div class="fig-control">
      <label>격자 수 N</label>
      <input type="range" id="s6a-n" min="2" max="25" step="1" value="3">
      <span class="fig-val" id="s6a-n-val">3×3</span>
    </div>
  </div>
  <div class="fig-caption"><strong>Figure 6.</strong> 위에서 내려다본 2D 함수(왼쪽)와 격자 근사(오른쪽). N을 키울수록 격자가 조밀해지며 근사가 정밀해진다.</div>
</div>

그럼 2D "범프" 하나는 구체적으로 뭘까? 1차원에서 범프 하나가 뉴런 2개(스위치 − 스위치)로 만들어졌듯이, 2차원 사각형 범프 하나는 $x_1$ 방향 범프 $\times$ $x_2$ 방향 범프다. 즉 "$x_1$이 여기서 여기까지, $x_2$가 여기서 여기까지"를 곱해주면, 사각형 안에서만 값이 1인[^6] 상자가 된다.

[^6]: 실제로는 1에 근사한 값을 가집니다, $\text{bump} \times$ 구간의 함수값의 평균

<div class="fig-interactive">
  <div style="display:flex; gap:16px; justify-content:center; align-items:flex-end; flex-wrap:wrap;">
    <div style="text-align:center;">
      <div style="font-size:12px; color:#888; margin-bottom:4px;">1D 범프 (스위치 2개)</div>
      <canvas id="fig6b-1d" width="200" height="140" style="border:1px solid #e0e0e0; border-radius:6px;"></canvas>
    </div>
    <div style="font-size:1.3rem; color:#aaa; padding-bottom:50px;">×</div>
    <div style="text-align:center;">
      <div style="font-size:12px; color:#888; margin-bottom:4px;">1D 범프 (다른 축)</div>
      <canvas id="fig6b-1d2" width="200" height="140" style="border:1px solid #e0e0e0; border-radius:6px;"></canvas>
    </div>
    <div style="font-size:1.3rem; color:#aaa; padding-bottom:50px;">=</div>
    <div style="text-align:center;">
      <div style="font-size:12px; color:#888; margin-bottom:4px;">2D 범프 (사각형)</div>
      <canvas id="fig6b-2d" width="200" height="200" style="border:1px solid #e0e0e0; border-radius:6px;"></canvas>
    </div>
  </div>
  <div class="fig-controls">
    <div class="fig-control">
      <label>범프 크기</label>
      <input type="range" id="s6b-size" min="0.5" max="3" step="0.1" value="1.5">
      <span class="fig-val" id="s6b-size-val">1.5</span>
    </div>
  </div>
  <div class="fig-caption"><strong>Figure 7.</strong> x₁ 방향 범프 × x₂ 방향 범프 = 사각형 범프. 1D에서 뉴런 2개가 범프 1개를 만들었듯이, 2D에서는 뉴런 4개가 사각형 범프 1개를 만든다.</div>
</div>

---
아래부터는 수학적 증명에 대한 간략한 설명으로 윗 부분의 내용만 이해하여도 충분하다 생각된다.

## 일단 안 된다고 가정해봄 (스포: 됨)

지금까지는 Universal Approximation의 핵심 개념을 직관적으로 이해했다면, 실제 증명은 **귀류법**을 사용한다. "근사할 수 없는 함수가 있다"고 가정하고 모순을 이끌어낸다.

증명의 큰 그림은 이렇다. 시그모이드가 가진 특별한 성질(discriminatory)을 이용해 "근사 못 하는 함수가 있다"는 가정이 모순임을 보인다. 이를 위해 두 개의 보조정리(Lemma)를 사용하는데, Lemma 1은 "discriminatory 함수로 만든 신경망은 조밀하다"를, Lemma 2는 "시그모이드는 실제로 discriminatory하다"를 각각 증명한다.

<div class="fig-interactive">
  <div class="fig-plot" style="text-align:center; padding: 1.5rem 0;">
    <img src="/blog/posts/assets/cybenko-universal-approximation/fig6-roadmap.svg" alt="증명의 구조" style="max-width:100%; height:auto;">
  </div>
  <div class="fig-caption"><strong>Figure 8.</strong> Cybenko 증명의 전체 구조. 시그모이달 → discriminatory (Lemma 2) → 조밀(dense) (Lemma 1) → UAT 성립.</div>
</div>

### Lemma 1: Discriminatory이면 조밀하다

먼저 "discriminatory"가 뭔지부터 이해하자. 

<strong>측도(measure)</strong>란 공간의 부분집합에 "크기"를 부여하는 함수다. 면적이나 확률분포를 떠올리면 된다. 그리고 $\sigma$(시그모이드)가 *discriminatory*하다는 것은 다음을 의미한다:

> 만약 어떤 측도 $\mu$에 대해 모든 가능한 $a$, $b$가 $\int \sigma(a^\top x + b)\, d\mu(x) = 0$ 이면, $\mu$는 반드시 영측도($\mu = 0$)이다.

쉽게 말하면 "$\sigma$ 뉴런들을 아무리 다양하게 조합해도 전부 적분이 0이 되는 측도가 있다면, 그건 아무 의미 없는 측도(= 0)뿐이다"라는 뜻이다. 즉 $\sigma$는 측도를 **식별해내는(discriminate)** 능력이 있다. 

이 성질이 왜 조밀함(denseness)을 보장하는가? 귀류법으로 보일 수 있다.

**가정**: $\sigma$의 선형결합(= 신경망)으로는 표현할 수 없는 연속함수 $g$가 있다고 가정하자. 즉, 신경망이 $g$에 아무리 가까이 가도 정확히 도달하지 못하는 "근사 할 수 없는 함수"가 존재한다.

**1단계 — Hahn-Banach 정리**: 이 정리는 함수해석학의 기본 도구로, "어떤 닫힌 부분공간(여기서는 신경망들의 집합)에 속하지 않는 원소가 있다면, 그 원소를 감지하면서 부분공간 전체를 무시하는 연속 선형범함수(continuous linear functional) $L$이 존재한다"는 정리다[^7].

[^7]: 선형범함수란 함수를 입력으로 받아서 실수를 출력하는 "함수 위의 함수"입니다. 예를 들어 $L(f) = \int f(x)\, d\mu(x)$는 함수 $f$를 받아서 실수(적분값)를 돌려주는 선형범함수입니다.

자.. 쉽게 생각해보자면 3차원 공간에 신경망으로 만들 수 있는 함수들이 모여서 하나의 평면($xy$)을 구성하고 있고, 우리가 근사하길 원하는 함수 $g$는 그 평면위에 없고 $z$축 방향으로 튀어나와 있다고 가정합니다. 이때 $z$ 좌표를 측정할 수 있는 도구를 $L$이라고 한다면 

<!-- 만들 수 있는 함수들이 하나의 평면(부분공간)이고, $g$가 그 평면 밖에 있다면, Hahn-Banach 정리는 "$g$ 쪽을 바라보지만 평면 위의 모든 것에는 눈이 먼 관측자 $L$이 있다"고 말한다. -->

이 $L$은 다음 두 성질을 만족한다[^8].

- 모든 신경망 출력 $f_\theta$에 대해: $L(f_\theta) = 0$ (평면 위는 무시)
  - $xy$평면 위의 어떤 점을 잡든 $z$좌표는 0이므로 $L=0$ -> 부분공간 무시됨
- $g$는 $z$축 방향으로 튀어나와 있으므로 $L(g) \neq 0$ -> $g$는 감지됨

[^8]: 위 성질이 Hahn-Banach 정리가 보장하는 $L$의 역할입니다. "$g$가 부분공간 밖에 있다면, $g$와 부분공간을 구별할 수 있는 측정 도구 $L$이 반드시 존재한다." 라는 정보만 알아가셔도 좋습니다.

**2단계 — Riesz 표현 정리**: 이 정리는 "연속 선형범함수는 항상 어떤 측도 $\mu$에 대한 적분으로 쓸 수 있다"는 정리다. 즉 $L(h) = \int h(x)\, d\mu(x)$인 측도 $\mu$가 존재한다.

따라서 1단계의 결과를 적분으로 다시 쓰면:

- 모든 $a$, $b$에 대해: $\int \sigma(a^\top x + b)\, d\mu(x) = 0$
- $\int g(x)\, d\mu(x) \neq 0$

**3단계 — 모순**: 첫 번째 조건은 "모든 뉴런에 대해 적분이 0"이라는 뜻이고, $\sigma$가 discriminatory이면 이는 $\mu = 0$을 의미한다. 그런데 $\mu = 0$이면 $L = 0$이 되어 $L(g) = 0$인데, 이는 $L(g) \neq 0$과 모순이다.

결론: "근사 할 수 없는 함수 $g$" 따위는 존재하지 않는다. 즉 신경망은 모든 연속함수에 대해 **조밀하다(dense)**.

### Lemma 2: 시그모이달 σ는 discriminatory이다

Lemma 1에서 "discriminatory이면 조밀하다"를 증명했으니, 이제 시그모이드가 실제로 discriminatory인지를 보여야 한다. 

다시 귀류법이다. 어떤 측도 $\mu$가 모든 $a$, $b$에 대해 $\int \sigma(a^\top x + b)\, d\mu(x) = 0$을 만족한다고 하자. 이로부터 $\mu = 0$을 보여야 한다.

**핵심 아이디어: 시그모이드 → 계단함수 → sin/cos → 푸리에 변환**

**1단계 — 반공간 만들기**: 앞에서 봤듯이 $\sigma(\lambda(a^\top x + b))$에서 $\lambda \to \infty$로 보내면 시그모이드가 계단함수(step function)에 수렴한다. 적분의 극한을 취하면:

$$\int \mathbf{1}_{H^+}(x)\, d\mu(x) = 0$$

여기서 $H^+ = \{x : a^\top x + b > 0\}$은 초평면의 한쪽인 <strong>반공간(half-space)</strong>이다[^9]. 즉 어떤 방향, 어떤 위치의 반공간을 잡든 $\mu$로 잰 크기가 0이라는 의미다. 비유하면, 공간을 어떤 칼로 반을 잘라도 양쪽 "무게"가 모두 0이라는 것이다.

[^9]: $H^{+}$라는 영역 안에서 $\mu$로 적분하면 0 이라는 뜻이다. $H^{+}={x:a^{\top}x+b>0}$은 초평면의 한쪽인 반공간을 의미하고, 2차원이면 직선 한쪽, 1차원이면 점 한쪽을 말합니다. 그래서 가능한 모든 반공간에서 $\mu$의 적분이 0이면, $\mu$자체가 0일 수 밖에 없습니다. 어떤 영역을 잡아도 $\mu$가 아무것도 측정하지 못하니까요.

**2단계 — 계단함수 만들기**: 반공간의 적분이 0이면, 반공간을 여러 개 조합해서 만드는 "계단함수"(staircase function)의 적분도 0이다. 계단함수는 서로 다른 높이의 단을 가진 함수인데, 각 단은 반공간들의 차이로 만들어지기 때문이다.

$$\int h(a^\top x + b)\, d\mu(x) = 0 \quad \text{(임의의 계단함수 } h \text{에 대해)}$$

**3단계 — sin, cos로 확장[^10]**: 계단함수는 어떤 유계(bounded) 가측함수(measurable function)이든 균등하게 근사할 수 있다[^11]. 특히 $\sin$과 $\cos$도 계단함수의 극한으로 표현 가능하다. 따라서:

[^10]: 증명 과정에서 종종 볼 수 있는 패턴입니다. 수학은 현재 가진 정보만으로 결론을 낼 수 없는 경우, 겉보기에 관계없어 보이는 정리를 잘 가져다 씁니다. 증명의 각 단계에서 "이건 알겠는데, 그래서 이제 어쩌라는 거지?" 라는 상황이 생기면, 다른 분야의 이미 증명된 정리를 가져와 각 단계 사이에 다리를 놓습니다. Cybenko proof 과정만 하더라도 함수해석학(Hahn-Banach), 측도론(Riesz representation), 조화해석학(Fourier Uniqueness)라는 세 분야의 정리를 가져다 씁니다. 
[^11]: 계단함수로 임의의 유계 가측함수를 균등 근사할 수 있다는 것은 측도론의 기본 결과입니다.

$$\int \cos(a^\top x)\, d\mu(x) = 0, \quad \int \sin(a^\top x)\, d\mu(x) = 0$$

이 두 식을 합치면 $\int e^{i\, a^\top x}\, d\mu(x) = 0$이 된다. 이것이 바로 측도 $\mu$의 **푸리에 변환** $\hat\mu(a) = 0$이다.

**4단계 — 결론**: 측도의 푸리에 변환이 모든 $a$에 대해 0이면, 그 측도는 반드시 영측도이다(푸리에 해석학의 유일성 정리에 의함). 따라서 $\mu = 0$.

이로써 시그모이드가 discriminatory임이 증명되었다.

<div class="fig-interactive">
  <div id="fig7-chain" class="fig-plot" style="min-height:300px;"></div>
  <div class="fig-caption"><strong>Figure 9.</strong> Lemma 2의 논리 체인. 날카로운 시그모이드(파란색)가 step function(청록색)에 수렴하고, 계단함수(노란색)와 삼각함수(빨간색)를 거쳐 푸리에 변환이 0임을 보인다.</div>
</div>

<!-- ## σ=1, σ=x: 탈락입니다

아무 함수나 discriminatory인 것은 아니다. 반례를 통해 이해해보자.

**상수함수 $\sigma(x) = 1$의 경우**: $[-1, 1]$ 위에서 $x = -1$에 무게 $-1$, $x = 1$에 무게 $+1$을 부여하는 측도 $\mu$를 생각하자. 이 측도는 영측도가 아닌데도($\mu \neq 0$), 모든 $a$, $b$에 대해 $\int 1\, d\mu = -1 + 1 = 0$이 된다. 즉 상수함수는 이 측도를 "식별"하지 못한다. 상수함수에게는 $x = -1$이든 $x = 1$이든 똑같이 보이기 때문이다.

**항등함수 $\sigma(x) = x$의 경우**: 마찬가지로 적절한 비영측도를 구성하면 적분을 0으로 만들 수 있다. 항등함수는 선형이라서 "넘기가 쉽기" 때문이다.

그렇다면 시그모이드가 다른 이유는 무엇일까? 핵심은 $\sigma$가 <strong>양쪽에서 포화(saturation)</strong>되어야 한다는 것이다. $r \to -\infty$에서 0으로, $r \to \infty$에서 1로 수렴하는 성질 덕분에 시그모이드를 날카롭게 만들면 계단함수(스위치)가 된다. 이 스위치가 Lemma 2에서 반공간 지시함수를 만들고, 푸리에 변환까지 연결하는 핵심 열쇠였다. 상수함수나 항등함수는 아무리 매개변수를 조절해도 스위치가 될 수 없으므로 discriminatory가 아니다.

<div class="fig-interactive">
  <div id="fig5" class="fig-plot" style="min-height:300px;"></div>
  <div class="fig-caption"><strong>Figure 10.</strong> sigmoid(청록색)은 양쪽에서 포화되어 discriminatory하다. 상수함수(빨간 점선)와 항등함수(금색 점선)는 포화되지 않아 discriminatory가 아니다.</div>
</div> -->

## 증명은 보내드렸습니다^^

지금까지의 증명을 정리해보자.

1. Lemma 2에서 시그모이드가 discriminatory임을 증명했다.
  - 반공간 → 계단함수 → sin/cos → 푸리에 변환 = 0 → 측도 = 0
2. Lemma 1에서 discriminatory이면 신경망이 조밀함을 증명했다.
  - 귀류법 + Hahn-Banach + Riesz → 모순
3. 따라서 시그모이드 신경망은 $C(K)$[^12] 위에서 조밀하다. 즉 Universal Approximation Theorem이 성립한다.

[^12]: Compact set $K$위에서 정의된 모든 연속함수들의 집합. $K=[0,1]$이면, $C([0,1])$은 구간 $[0,1]$ 위의 모든 연속함수를 모아놓은 것입니다. 예를 들어 $\sin(x)$, $x^{2}+3x$도 속하고, 어떤 복잡한 곡선이든 해당 구간에서 연속이기만 하면 됩니다.

Universal Approximation Theorem은 강력하지만 한계도 명확하다. 이 정리는 $N$이 충분히 크면 근사가 <strong>가능하다</strong>고 말할 뿐, $N$이 구체적으로 얼마나 필요한지는 알려주지 않는다. 또한 SGD 같은 학습 알고리즘이 실제로 그 파라미터를 찾을 수 있는지도 별개의 문제다. 비유하자면, "서울 어딘가에 맛집이 있다"고 증명한 것이지 그게 어딘지 주소를 알려준 것이 아니다.

그럼에도 이 정리가 중요한 이유는, 신경망이라는 구조가 <strong>원칙적으로</strong> 충분히 풍부한 표현력을 가지고 있음을 보장하기 때문이다. 따라서 모델의 표현력(expressiveness) 자체는 병목이 아니라는 것. 실제 병목은 최적화와 일반화에 있고, 이것이 이후 수십 년간 딥러닝 이론 연구의 출발점이 된다.

---

*Based on G. Cybenko, "Approximation by Superpositions of a Sigmoidal Function", Mathematics of Control, Signals, and Systems, 1989.*

<script>
(function() {
  // Wait for Plotly to be available
  function waitForPlotly(cb) {
    if (typeof Plotly !== 'undefined') return cb();
    setTimeout(function() { waitForPlotly(cb); }, 100);
  }

  waitForPlotly(function() {
    var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    var bg = isDark ? '#1e1e28' : '#ffffff';
    var grid = isDark ? '#2a2a34' : '#f0f0f0';
    var line = isDark ? '#333' : '#ddd';
    var label = isDark ? '#888' : '#888';
    var blue = '#3a6ea5', red = '#c44e52', teal = '#3a9e8f', gold = '#c9a227';

    var baseLayout = {
      paper_bgcolor: bg, plot_bgcolor: bg,
      font: { color: label, family: 'Inter, Pretendard, sans-serif', size: 12 },
      margin: { l: 48, r: 16, t: 8, b: 44 },
      xaxis: { gridcolor: grid, zerolinecolor: line, linecolor: line },
      yaxis: { gridcolor: grid, zerolinecolor: line, linecolor: line },
    };

    var cfg = { responsive: true, displayModeBar: false };

    function sigmoid(x) { return 1 / (1 + Math.exp(-x)); }
    function linspace(a, b, n) {
      var r = []; for (var i = 0; i < n; i++) r.push(a + (b - a) * i / (n - 1)); return r;
    }

    // ===== Fig 1 =====
    function drawFig1() {
      var d = parseFloat(document.getElementById('s1-delta').value);
      document.getElementById('s1-delta-val').textContent = d.toFixed(2);
      var x = linspace(-5, 5, 300);
      Plotly.react('fig1', [
        { x: x, y: x.map(function(v){return v>=0?1:0;}), mode:'lines', name:'step', line:{color:red,width:1.5,dash:'dash'} },
        { x: x, y: x.map(function(v){return sigmoid(v/d);}), mode:'lines', name:'σ(x/δ)', line:{color:blue,width:2.5} },
      ], Object.assign({}, baseLayout, {
        yaxis: Object.assign({}, baseLayout.yaxis, {range:[-0.08,1.12]}),
        showlegend:true, legend:{x:0.02,y:0.98,bgcolor:'rgba(0,0,0,0)',font:{size:11}}
      }), cfg);
    }
    document.getElementById('s1-delta').addEventListener('input', drawFig1);
    drawFig1();

    // ===== Fig 2 =====
    function drawFig2() {
      var t0=parseFloat(document.getElementById('s2-t0').value);
      var t1=parseFloat(document.getElementById('s2-t1').value);
      var h=parseFloat(document.getElementById('s2-h').value);
      document.getElementById('s2-t0-val').textContent=t0.toFixed(1);
      document.getElementById('s2-t1-val').textContent=t1.toFixed(1);
      document.getElementById('s2-h-val').textContent=h.toFixed(1);
      var dl=0.06, x=linspace(-6,6,500);
      Plotly.react('fig2',[
        {x:x,y:x.map(function(v){return(v>=t0&&v<=t1)?h:0;}),mode:'lines',name:'ideal',line:{color:gold,width:1.5,dash:'dash'}},
        {x:x,y:x.map(function(v){return h*(sigmoid((v-t0)/dl)-sigmoid((v-t1)/dl));}),mode:'lines',name:'σ₁−σ₂',line:{color:teal,width:2.5}},
      ], Object.assign({},baseLayout,{
        yaxis:Object.assign({},baseLayout.yaxis,{range:[-0.15,3]}),
        showlegend:true, legend:{x:0.02,y:0.98,bgcolor:'rgba(0,0,0,0)',font:{size:11}}
      }), cfg);
    }
    ['s2-t0','s2-t1','s2-h'].forEach(function(id){document.getElementById(id).addEventListener('input',drawFig2);});
    drawFig2();

    // ===== Fig 3 =====
    function targetF(x){return Math.sin(2*x)+0.5*Math.cos(5*x)+1.5;}
    function drawFig3(){
      var N=parseInt(document.getElementById('s3-n').value);
      document.getElementById('s3-n-val').textContent=N;
      var x=linspace(-3,3,500), yT=x.map(targetF);
      var nB=Math.max(1,Math.floor(N/2)), w=6/nB, dl=0.04;
      var yA=x.map(function(){return 0;});
      for(var i=0;i<nB;i++){
        var l=-3+i*w, m=l+w/2, h=targetF(m);
        for(var j=0;j<x.length;j++) yA[j]+=h*(sigmoid((x[j]-l)/dl)-sigmoid((x[j]-l-w)/dl));
      }
      var yE=x.map(function(_,i){return Math.abs(yT[i]-yA[i]);});
      var maxE=Math.max.apply(null,yE).toFixed(3);
      Plotly.react('fig3',[
        {x:x,y:yT,mode:'lines',name:'f⋆',line:{color:red,width:2}},
        {x:x,y:yA,mode:'lines',name:'NN (N='+N+')',line:{color:blue,width:2}},
        {x:x,y:yE,mode:'lines',name:'error (max='+maxE+')',line:{color:'#aaa',width:1,dash:'dot'},yaxis:'y2'},
      ], Object.assign({},baseLayout,{
        yaxis:Object.assign({},baseLayout.yaxis,{range:[-0.5,3.5],title:{text:'f(x)',font:{size:11}}}),
        yaxis2:{overlaying:'y',side:'right',gridcolor:'transparent',range:[0,2],tickfont:{color:'#bbb',size:10}},
        showlegend:true, legend:{x:0.02,y:0.98,bgcolor:'rgba(0,0,0,0)',font:{size:11}}
      }), cfg);
    }
    document.getElementById('s3-n').addEventListener('input',drawFig3);
    drawFig3();

    // ===== Fig 4 =====
    function drawFig4(){
      var ang=parseFloat(document.getElementById('s4-angle').value);
      var b=parseFloat(document.getElementById('s4-bias').value);
      var sh=parseFloat(document.getElementById('s4-sharp').value);
      document.getElementById('s4-angle-val').textContent=ang+'°';
      document.getElementById('s4-bias-val').textContent=b.toFixed(1);
      document.getElementById('s4-sharp-val').textContent=sh.toFixed(1);
      var rad=ang*Math.PI/180, a1=Math.cos(rad), a2=Math.sin(rad);
      var n=50, xs=linspace(-3,3,n), ys=linspace(-3,3,n), z=[];
      for(var i=0;i<n;i++){z.push([]);for(var j=0;j<n;j++) z[i].push(sigmoid(sh*(a1*xs[j]+a2*ys[i]+b)));}
      Plotly.react('fig4',[{
        type:'surface',x:xs,y:ys,z:z,
        colorscale:[[0,'#e8eef5'],[0.5,'#7ea8c8'],[1,'#2a5a80']],
        showscale:false,
      }],Object.assign({},baseLayout,{
        margin:{l:0,r:0,t:0,b:0},
        scene:{
          xaxis:{title:'x₁',gridcolor:grid,backgroundcolor:bg},
          yaxis:{title:'x₂',gridcolor:grid,backgroundcolor:bg},
          zaxis:{title:'σ',gridcolor:grid,backgroundcolor:bg,range:[0,1]},
          bgcolor:bg, camera:{eye:{x:1.5,y:1.5,z:1.0}},
        },
      }),{responsive:true});
    }
    ['s4-angle','s4-bias','s4-sharp'].forEach(function(id){document.getElementById(id).addEventListener('input',drawFig4);});
    drawFig4();

    // ===== Fig 5: 2D multi-neuron approximation =====
    (function(){
      var n=50, xs=linspace(-3,3,n), ys=linspace(-3,3,n);
      var neurons=[
        {a1:1,a2:0.5,b:0.5,u:1.5,s:3},
        {a1:-0.5,a2:1,b:-1,u:-1.2,s:3},
        {a1:0.8,a2:-0.8,b:1.5,u:0.8,s:4},
        {a1:-1,a2:-0.3,b:-0.5,u:1.0,s:3},
        {a1:0.3,a2:1.2,b:0,u:-0.6,s:5},
        {a1:1.5,a2:0,b:-1.5,u:0.9,s:2.5},
      ];
      var zT=[],zN=[];
      for(var i=0;i<n;i++){
        zT.push([]);zN.push([]);
        for(var j=0;j<n;j++){
          var x1=xs[j],x2=ys[i];
          zT[i].push(Math.sin(x1)*Math.cos(x2)+0.3*Math.sin(3*x1*x2));
          var v=0;for(var k=0;k<neurons.length;k++){var nr=neurons[k];v+=nr.u*sigmoid(nr.s*(nr.a1*x1+nr.a2*x2+nr.b));}
          zN[i].push(v-0.8);
        }
      }
      Plotly.newPlot('fig5-2d',[
        {type:'surface',x:xs,y:ys,z:zT,colorscale:[[0,'#fce4e4'],[0.5,'#d35f5f'],[1,'#8b2020']],showscale:false,opacity:0.65,name:'target'},
        {type:'surface',x:xs,y:ys,z:zN,colorscale:[[0,'#e4e8f0'],[0.5,'#6a8cba'],[1,'#2a4a70']],showscale:false,opacity:0.85,name:'NN'},
      ],Object.assign({},baseLayout,{
        margin:{l:0,r:0,t:0,b:0},
        scene:{
          xaxis:{title:'x₁',gridcolor:grid,backgroundcolor:bg},
          yaxis:{title:'x₂',gridcolor:grid,backgroundcolor:bg},
          zaxis:{title:'f',gridcolor:grid,backgroundcolor:bg},
          bgcolor:bg, camera:{eye:{x:1.7,y:1.3,z:1.1}},
        },
      }),{responsive:true});
    })();

    // ===== Fig 6: 2D grid heatmap approximation (canvas) =====
    (function(){
      var SZ=240;
      function tf2d(x1,x2){return Math.sin(1.5*x1)*Math.cos(1.5*x2)+0.4*Math.sin(2*x1+x2);}
      function v2c(v,lo,hi){
        var t=Math.max(0,Math.min(1,(v-lo)/(hi-lo||1)));
        var r,g,b;
        if(t<0.5){var s=t*2;r=30+s*10|0;g=50+s*150|0;b=140-s*40|0;}
        else{var s=(t-0.5)*2;r=40+s*210|0;g=200-s*40|0;b=100-s*80|0;}
        return[r,g,b];
      }
      // precompute target
      var tg=[],flo=1e9,fhi=-1e9;
      for(var py=0;py<SZ;py++){tg.push([]);for(var px=0;px<SZ;px++){
        var v=tf2d(-3+6*px/SZ,-3+6*py/SZ);tg[py].push(v);if(v<flo)flo=v;if(v>fhi)fhi=v;
      }}
      // draw target
      var cT=document.getElementById('fig6a-target');
      if(cT){
        var ctx=cT.getContext('2d'),img=ctx.createImageData(SZ,SZ);
        for(var py=0;py<SZ;py++)for(var px=0;px<SZ;px++){
          var c=v2c(tg[py][px],flo,fhi),i=(py*SZ+px)*4;
          img.data[i]=c[0];img.data[i+1]=c[1];img.data[i+2]=c[2];img.data[i+3]=255;
        }
        ctx.putImageData(img,0,0);
      }
      // draw approx
      function drawApprox(){
        var N=parseInt(document.getElementById('s6a-n').value);
        document.getElementById('s6a-n-val').textContent=N+'×'+N;
        var cA=document.getElementById('fig6a-approx');
        if(!cA)return;
        var ctx=cA.getContext('2d'),img=ctx.createImageData(SZ,SZ);
        var cw=6/N;
        for(var py=0;py<SZ;py++)for(var px=0;px<SZ;px++){
          var x1=-3+6*px/SZ,x2=-3+6*py/SZ;
          var ci=Math.min(N-1,(x1+3)/cw|0),cj=Math.min(N-1,(x2+3)/cw|0);
          var av=tf2d(-3+(ci+0.5)*cw,-3+(cj+0.5)*cw);
          var c=v2c(av,flo,fhi),i=(py*SZ+px)*4;
          img.data[i]=c[0];img.data[i+1]=c[1];img.data[i+2]=c[2];img.data[i+3]=255;
        }
        ctx.putImageData(img,0,0);
        // grid lines
        ctx.strokeStyle='rgba(255,255,255,0.35)';ctx.lineWidth=1;
        for(var i=1;i<N;i++){var p=SZ*i/N;
          ctx.beginPath();ctx.moveTo(p,0);ctx.lineTo(p,SZ);ctx.stroke();
          ctx.beginPath();ctx.moveTo(0,p);ctx.lineTo(SZ,p);ctx.stroke();
        }
        // center dots
        ctx.fillStyle='rgba(255,255,255,0.5)';
        for(var ci=0;ci<N;ci++)for(var cj=0;cj<N;cj++){
          ctx.beginPath();ctx.arc(SZ*(ci+0.5)/N,SZ*(cj+0.5)/N,Math.max(1.5,3.5-N*0.12),0,Math.PI*2);ctx.fill();
        }
      }
      document.getElementById('s6a-n').addEventListener('input',drawApprox);
      drawApprox();
    })();

    // ===== Fig 7: 2D bump = 1D bump × 1D bump (canvas) =====
    (function(){
      var sharp=15;
      function draw1DBump(canvasId,label){
        var c=document.getElementById(canvasId);if(!c)return;
        var ctx=c.getContext('2d'),w=200,h=140;
        var bSize=parseFloat(document.getElementById('s6b-size').value);
        var t0=-bSize/2,t1=bSize/2;
        ctx.clearRect(0,0,w,h);ctx.fillStyle='#fafafa';ctx.fillRect(0,0,w,h);
        var pad={l:20,r:8,t:8,b:16},pw=w-pad.l-pad.r,ph=h-pad.t-pad.b;
        ctx.strokeStyle='#ddd';ctx.lineWidth=1;
        ctx.beginPath();ctx.moveTo(pad.l,pad.t);ctx.lineTo(pad.l,h-pad.b);ctx.lineTo(w-pad.r,h-pad.b);ctx.stroke();
        // fill
        ctx.fillStyle='rgba(58,110,165,0.15)';ctx.beginPath();
        var first=true;
        for(var i=0;i<=200;i++){
          var x=-4+8*i/200,v=sigmoid(sharp*(x-t0))-sigmoid(sharp*(x-t1));
          var cx=pad.l+(x+4)/8*pw,cy=h-pad.b-v*ph*0.85;
          if(first){ctx.moveTo(cx,h-pad.b);ctx.lineTo(cx,cy);first=false;}else ctx.lineTo(cx,cy);
        }
        ctx.lineTo(pad.l+pw,h-pad.b);ctx.closePath();ctx.fill();
        // line
        ctx.strokeStyle='#3a6ea5';ctx.lineWidth=2.5;ctx.beginPath();
        for(var i=0;i<=200;i++){
          var x=-4+8*i/200,v=sigmoid(sharp*(x-t0))-sigmoid(sharp*(x-t1));
          var cx=pad.l+(x+4)/8*pw,cy=h-pad.b-v*ph*0.85;
          if(i===0)ctx.moveTo(cx,cy);else ctx.lineTo(cx,cy);
        }
        ctx.stroke();
        // brackets
        var bx0=pad.l+(t0+4)/8*pw,bx1=pad.l+(t1+4)/8*pw;
        ctx.strokeStyle='#c44e52';ctx.lineWidth=1;ctx.setLineDash([3,3]);
        ctx.beginPath();ctx.moveTo(bx0,pad.t);ctx.lineTo(bx0,h-pad.b);ctx.stroke();
        ctx.beginPath();ctx.moveTo(bx1,pad.t);ctx.lineTo(bx1,h-pad.b);ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle='#888';ctx.font='10px sans-serif';ctx.fillText(label,pad.l+2,pad.t+12);
      }
      function draw2DBump(){
        var bSize=parseFloat(document.getElementById('s6b-size').value);
        document.getElementById('s6b-size-val').textContent=bSize.toFixed(1);
        draw1DBump('fig6b-1d','x₁ 방향');
        draw1DBump('fig6b-1d2','x₂ 방향');
        var c=document.getElementById('fig6b-2d');if(!c)return;
        var ctx=c.getContext('2d'),sz=200;
        var a=-bSize/2,b2=bSize/2;
        var img=ctx.createImageData(sz,sz);
        for(var py=0;py<sz;py++)for(var px=0;px<sz;px++){
          var x1=-4+8*px/sz,x2=-4+8*py/sz;
          var v=(sigmoid(sharp*(x1-a))-sigmoid(sharp*(x1-b2)))*(sigmoid(sharp*(x2-a))-sigmoid(sharp*(x2-b2)));
          v=Math.max(0,Math.min(1,v));
          var i=(py*sz+px)*4;
          img.data[i]=240-v*200|0;img.data[i+1]=244-v*134|0;img.data[i+2]=250-v*45|0;img.data[i+3]=255;
        }
        ctx.putImageData(img,0,0);
        // border lines
        var lx0=(a+4)/8*sz,lx1=(b2+4)/8*sz;
        ctx.strokeStyle='#c44e52';ctx.lineWidth=1.5;ctx.setLineDash([4,3]);
        ctx.beginPath();ctx.moveTo(lx0,0);ctx.lineTo(lx0,sz);ctx.stroke();
        ctx.beginPath();ctx.moveTo(lx1,0);ctx.lineTo(lx1,sz);ctx.stroke();
        ctx.beginPath();ctx.moveTo(0,lx0);ctx.lineTo(sz,lx0);ctx.stroke();
        ctx.beginPath();ctx.moveTo(0,lx1);ctx.lineTo(sz,lx1);ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle='#fff';ctx.font='bold 12px sans-serif';
        ctx.fillText('≈ 1',(lx0+lx1)/2-10,(lx0+lx1)/2+4);
      }
      document.getElementById('s6b-size').addEventListener('input',draw2DBump);
      draw2DBump();
    })();

    // ===== Fig 9 (was 7): Lemma 2 logic chain =====
    (function(){
      var x=linspace(-5,5,300),dl=0.12;
      Plotly.newPlot('fig7-chain',[
        {x:x,y:x.map(function(v){return sigmoid(v/dl);}),mode:'lines',name:'① σ sharp',line:{color:blue,width:2}},
        {x:x,y:x.map(function(v){return v>=0?1:0;}),mode:'lines',name:'② step',line:{color:teal,width:1.5,dash:'dash'}},
        {x:x,y:x.map(function(v){return v<-3?0:v<-1?0.3:v<1?0.8:v<3?0.5:0.1;}),mode:'lines',name:'③ staircase',line:{color:gold,width:1.5}},
        {x:x,y:x.map(function(v){return 0.5*Math.sin(v)+0.5;}),mode:'lines',name:'④ sin/cos',line:{color:red,width:1.5}},
      ],Object.assign({},baseLayout,{
        yaxis:Object.assign({},baseLayout.yaxis,{range:[-0.15,1.2]}),
        showlegend:true, legend:{x:0.02,y:0.98,bgcolor:'rgba(0,0,0,0)',font:{size:11}}
      }),cfg);
    })();

    // ===== Fig 10 (was 8): discriminatory comparison =====
    (function(){
      var x=linspace(-4,4,300);
      Plotly.newPlot('fig5',[
        {x:x,y:x.map(sigmoid),mode:'lines',name:'sigmoid ✓',line:{color:teal,width:2.5}},
        {x:x,y:x.map(function(){return 1;}),mode:'lines',name:'σ=1 ✗',line:{color:red,width:1.5,dash:'dash'}},
        {x:x,y:x,mode:'lines',name:'σ=x ✗',line:{color:gold,width:1.5,dash:'dot'}},
      ],Object.assign({},baseLayout,{
        yaxis:Object.assign({},baseLayout.yaxis,{range:[-3.5,3.5]}),
        showlegend:true, legend:{x:0.02,y:0.98,bgcolor:'rgba(0,0,0,0)',font:{size:11}}
      }),cfg);
    })();
  });
})();
</script>
