---
title: "왜 뉴럴 네트워크는 모든 함수를 근사할 수 있을까?"
date: "2026-04-14"
category: "Deep Learning Theory"
tags: ["Universal Approximation", "Cybenko", "Neural Networks", "Functional Analysis"]
---

# 왜 뉴럴 네트워크는 모든 함수를 근사할 수 있을까?

가장 단순한 뉴럴 네트워크를 떠올려 보자. 입력층, 은닉층 하나, 출력층. 활성화 함수는 시그모이드. 이 네트워크의 출력은 이런 형태다:

$$f_\theta(x) = \sum_{i=1}^{N} u_i \, \sigma(a_i^\top x + b_i)$$

각 항은 시그모이드를 한 번 통과한 값에 가중치를 곱한 것에 불과하다. 이런 단순한 조합이 정말 **임의의 연속함수**를 원하는 만큼 정확하게 흉내 낼 수 있을까?

1989년, George Cybenko가 "예"라고 답했다. 뉴런 수 $N$을 충분히 크게 하면, 컴팩트 집합 위의 어떤 연속함수든 균등하게(sup-norm으로) 근사할 수 있다. 이것이 **Universal Approximation Theorem**이다.

> 다만 이것은 존재성(existence) 정리다. $N$이 구체적으로 얼마나 필요한지, 또 학습 알고리즘이 그 파라미터를 찾을 수 있는지는 별개의 문제다.

증명의 수학적 디테일 대신, 핵심 아이디어를 시각적으로 따라가 보자.

## 시그모이드를 날카롭게 만들기

시그모이드 $\sigma(x) = 1/(1+e^{-x})$는 부드러운 S자 곡선이다. 그런데 입력을 $\delta$로 나누면 — 즉 $\sigma(x/\delta)$에서 $\delta$를 0에 가깝게 줄이면 — 곡선이 점점 뾰족해지면서 **계단함수(step function)**에 수렴한다.

![Figure 1 — δ를 줄이면 σ(x/δ)가 step function에 수렴한다.](/blog/posts/assets/fig1-sigmoid-sharpness.svg)

직관은 단순하다. 시그모이드를 충분히 압축하면 특정 지점에서 0에서 1로 점프하는 **스위치**가 된다. 이 스위치는 "여기부터 켜짐"이라는 지시함수 $\mathbf{1}_{[c,\,\infty)}$ 역할을 한다.

## 스위치 두 개로 범프를 만든다

스위치 하나가 "여기부터 켜짐"이라면, 두 개를 빼면 "여기서 여기까지만 켜짐"을 만들 수 있다:

$$\sigma\!\left(\frac{x - t_0}{\delta}\right) - \sigma\!\left(\frac{x - t_1}{\delta}\right) \;\approx\; \mathbf{1}_{[t_0,\, t_1]}(x)$$

이것은 구간 $[t_0, t_1]$에서만 값이 1이고 나머지는 0인 범프(bump)다. 뉴런 두 개가 모여서 하나의 블록을 만드는 셈이다.

![Figure 2 — 시그모이드 두 개의 차이가 구간 지시함수(범프)를 근사한다.](/blog/posts/assets/fig2-bump.svg)

## 범프를 쌓아서 함수를 만든다

이제 핵심이다. 근사하고 싶은 연속함수 $f_\star$가 있으면, 정의역을 잘게 쪼개서 각 구간에서 함수값의 평균 높이를 가진 블록으로 표현한다. 그리고 각 블록은 방금 만든 범프 하나에 대응된다.

레고 블록을 쌓아 곡면을 만드는 것과 같다. 블록이 많을수록(뉴런 수 $N$이 클수록) 곡면의 윤곽이 더 정밀해진다.

![Figure 3 — 뉴런 수 N을 늘리면 파란색 근사가 빨간색 목표함수에 점점 가까워진다.](/blog/posts/assets/fig3-approximation.svg)

> **이것이 universal approximation의 핵심 직관이다.** 시그모이드 → 스위치 → 범프 → 범프를 쌓아서 임의의 함수를 근사. $N$이 커질수록 오차는 얼마든지 줄어든다.

## 2차원으로 확장하면

1차원에서는 구간으로 쪼갰지만, 입력이 2차원 이상이면 상황이 달라진다. $\sigma(a^\top x + b)$에서 $a^\top x + b = 0$은 하나의 **초평면(hyperplane)**이고, 그 한쪽은 1, 반대쪽은 0이 된다. 즉 하나의 뉴런은 공간을 반으로 자른다.

여러 뉴런이 서로 다른 방향과 위치에서 공간을 자르면 다각형 영역을 만들 수 있고, 각 영역에 다른 높이를 부여하면 2차원 함수를 근사하게 된다.

![Figure 4 — 단일 뉴런 σ(a₁x₁ + a₂x₂ + b)의 출력. 방향(θ)과 날카로움이 다른 세 가지 경우.](/blog/posts/assets/fig4-halfplane.svg)

## 증명은 어떻게 진행되나

지금까지가 직관이었다면, 실제 증명은 조금 다른 경로를 밟는다. 핵심은 **귀류법**이다. "근사할 수 없는 함수가 있다"고 가정하고 모순을 이끌어낸다.

![Figure 5 — 증명의 구조. 두 개의 Lemma가 Theorem 1을 완성한다.](/blog/posts/assets/fig6-roadmap.svg)

### Lemma 1: Discriminatory이면 조밀하다

$\sigma$가 *discriminatory*하다는 것은 "$\sigma(a^\top x + b)$ 형태의 함수들에 대해 적분이 전부 0이 되는 측도(measure)는 영측도뿐이다"라는 뜻이다.

이 성질이 있으면, $\sigma$의 선형결합으로 표현할 수 없는 함수 $g$가 있다고 가정했을 때 **Hahn-Banach 정리**로 "$g$는 감지하지만 $\sigma$ 조합은 무시하는" 선형범함수 $L$을 만들 수 있고, **Riesz 표현 정리**에 의해 이 $L$은 측도 $\mu$에 대응된다. 그런데 discriminatory 조건에 의해 $\mu = 0$이 되어 $L = 0$. 이는 $L(g) \neq 0$과 모순이다.

### Lemma 2: 시그모이달 σ는 discriminatory이다

이것이 해석학적 핵심이다. 앞에서 봤듯이 시그모이드를 날카롭게 만들면($\delta \to 0$) 반공간(half-space)의 지시함수로 수렴한다. 이를 통해 "모든 반공간에 대해 $\mu = 0$"을 보이고, 여기서 반공간 지시 → 계단함수 → $\sin$, $\cos$ → 푸리에 변환으로 연결하여 $\hat\mu(a) = 0$을 얻는다.

측도의 푸리에 변환이 항등적으로 0이면 그 측도는 영측도이므로 $\mu = 0$이 된다.

## 왜 시그모이드여야 하나

아무 함수나 discriminatory인 것은 아니다. 상수함수 $\sigma(x) = 1$의 경우, $\mu = -\delta_{-1} + \delta_1 \neq 0$인데도 $\int 1\, d\mu = 0$이 되므로 discriminatory가 아니다. 항등함수 $\sigma(x) = x$도 마찬가지다.

핵심은 $\sigma$가 **양쪽에서 포화(saturation)**되어야 한다는 것이다. $r \to -\infty$에서 0, $r \to \infty$에서 1로 수렴해야 "날카로운 스위치"를 만들 수 있고, 이것이 discriminatory 성질을 보장한다.

![Figure 6 — sigmoid은 양쪽에서 포화되어 discriminatory하지만, 상수함수와 항등함수는 그렇지 않다.](/blog/posts/assets/fig5-discriminatory.svg)

## 남은 질문들

Universal Approximation Theorem은 강력하지만 한계도 명확하다. 이 정리는 $N$이 충분히 크면 근사가 *가능하다*고 말할 뿐, $N$이 구체적으로 얼마나 필요한지는 알려주지 않는다. 또한 SGD 같은 학습 알고리즘이 실제로 그 파라미터를 찾을 수 있는지도 별개의 문제다.

그럼에도 이 정리가 중요한 이유는, 뉴럴 네트워크라는 함수 클래스가 *원칙적으로* 충분히 풍부하다는 것을 보장하기 때문이다. 모델의 표현력(expressiveness) 자체는 병목이 아니라는 것. 실제 병목은 최적화와 일반화에 있고, 이것이 이후 수십 년간 딥러닝 이론 연구의 출발점이 된다.

---

*Based on G. Cybenko, "Approximation by Superpositions of a Sigmoidal Function", Mathematics of Control, Signals, and Systems, 1989.*
