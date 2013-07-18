#include <SFML/Graphics.hpp>
#include <string>
#include <time.h>
#include <iostream>
#pragma once

using namespace std;
using namespace sf;

class Bar
{
public:
	Bar(void);
	~Bar(void);

	int speed;
	RectangleShape* rec;

	void move(float x, float y);
    void move(Vector2f dir);
};
